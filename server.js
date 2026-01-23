// backend/server.js
// Trendy VybzTech Inventory Management API
// Connects to Neon PostgreSQL Database

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Neon Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('✅ Connected to Neon Database');
        console.log('Server time:', res.rows[0].now);
    }
});

// ============================================
// PRODUCT ENDPOINTS
// ============================================

// Get all products with their variants and stock info
app.get('/api/products', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id,
                p.name,
                p.category,
                p.base_price as price,
                p.image_url as image,
                p.description,
                json_agg(
                    json_build_object(
                        'variant_id', pv.id,
                        'type', pv.variant_type,
                        'value', pv.variant_value,
                        'stock', pv.stock_quantity,
                        'low_stock_threshold', pv.low_stock_threshold,
                        'sku', pv.sku,
                        'is_available', pv.is_available
                    )
                ) as variants
            FROM products p
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            WHERE p.is_active = true
            GROUP BY p.id
            ORDER BY p.category, p.name;
        `;
        
        const result = await pool.query(query);
        
        // Transform data to match frontend format
        const products = result.rows.map(product => {
            const variants = {};
            const stockInfo = {};
            
            product.variants.forEach(variant => {
                if (!variant.type) return;
                
                if (!variants[variant.type]) {
                    variants[variant.type] = [];
                }
                
                variants[variant.type].push({
                    value: variant.value,
                    stock: variant.stock,
                    available: variant.is_available && variant.stock > 0,
                    low_stock: variant.stock <= variant.low_stock_threshold,
                    variant_id: variant.variant_id,
                    sku: variant.sku
                });
            });
            
            return {
                id: product.id,
                name: product.name,
                category: product.category,
                price: parseFloat(product.price),
                image: product.image,
                description: product.description,
                variants: variants
            };
        });
        
        res.json({ success: true, products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                p.*,
                json_agg(
                    json_build_object(
                        'variant_id', pv.id,
                        'type', pv.variant_type,
                        'value', pv.variant_value,
                        'stock', pv.stock_quantity,
                        'sku', pv.sku,
                        'is_available', pv.is_available
                    )
                ) as variants
            FROM products p
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            WHERE p.id = $1 AND p.is_active = true
            GROUP BY p.id;
        `;
        
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        
        res.json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check stock for specific variant
app.post('/api/products/check-stock', async (req, res) => {
    try {
        const { product_id, variant_type, variant_value } = req.body;
        
        const query = `
            SELECT 
                pv.id as variant_id,
                pv.stock_quantity,
                pv.low_stock_threshold,
                pv.is_available,
                pv.sku
            FROM product_variants pv
            WHERE pv.product_id = $1 
                AND pv.variant_type = $2 
                AND pv.variant_value = $3;
        `;
        
        const result = await pool.query(query, [product_id, variant_type, variant_value]);
        
        if (result.rows.length === 0) {
            return res.json({ 
                success: true, 
                in_stock: false,
                stock_quantity: 0,
                message: 'Variant not found'
            });
        }
        
        const variant = result.rows[0];
        const in_stock = variant.is_available && variant.stock_quantity > 0;
        const low_stock = variant.stock_quantity <= variant.low_stock_threshold;
        
        res.json({
            success: true,
            in_stock,
            low_stock,
            stock_quantity: variant.stock_quantity,
            variant_id: variant.variant_id,
            sku: variant.sku
        });
    } catch (error) {
        console.error('Error checking stock:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ORDER ENDPOINTS
// ============================================

// Create new order and reduce inventory
app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            order_id,
            customer_name,
            customer_email,
            customer_phone,
            customer_address,
            subtotal,
            delivery_fee,
            total,
            payment_method,
            delivery_option,
            delivery_parish,
            items
        } = req.body;
        
        // Insert order
        const orderQuery = `
            INSERT INTO orders (
                order_id, customer_name, customer_email, customer_phone,
                customer_address, subtotal, delivery_fee, total,
                payment_method, delivery_option, delivery_parish
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id;
        `;
        
        const orderResult = await client.query(orderQuery, [
            order_id, customer_name, customer_email, customer_phone,
            customer_address, subtotal, delivery_fee, total,
            payment_method, delivery_option, delivery_parish
        ]);
        
        const db_order_id = orderResult.rows[0].id;
        
        // Insert order items and reduce inventory
        for (const item of items) {
            // Find variant ID
            const variantQuery = `
                SELECT id, stock_quantity 
                FROM product_variants 
                WHERE product_id = $1 
                    AND variant_type = $2 
                    AND variant_value = $3;
            `;
            
            const variantResult = await client.query(variantQuery, [
                item.product_id,
                item.variant_type,
                item.variant_value
            ]);
            
            if (variantResult.rows.length === 0) {
                throw new Error(`Variant not found for product ${item.product_id}`);
            }
            
            const variant = variantResult.rows[0];
            
            // Check if enough stock
            if (variant.stock_quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${item.product_name}. Available: ${variant.stock_quantity}`);
            }
            
            // Insert order item
            const orderItemQuery = `
                INSERT INTO order_items (
                    order_id, product_id, variant_id, product_name,
                    variant_details, quantity, unit_price, total_price
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            `;
            
            await client.query(orderItemQuery, [
                db_order_id,
                item.product_id,
                variant.id,
                item.product_name,
                JSON.stringify(item.variants),
                item.quantity,
                item.unit_price,
                item.total_price
            ]);
            
            // Reduce inventory
            const newStock = variant.stock_quantity - item.quantity;
            const updateStockQuery = `
                UPDATE product_variants 
                SET stock_quantity = $1, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2;
            `;
            
            await client.query(updateStockQuery, [newStock, variant.id]);
            
            // Log inventory transaction
            const transactionQuery = `
                INSERT INTO inventory_transactions (
                    variant_id, transaction_type, quantity_change,
                    previous_quantity, new_quantity, reference_order_id,
                    notes, created_by
                ) VALUES ($1, 'sale', $2, $3, $4, $5, $6, 'system');
            `;
            
            await client.query(transactionQuery, [
                variant.id,
                -item.quantity,
                variant.stock_quantity,
                newStock,
                order_id,
                `Order placed by ${customer_name}`
            ]);
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Order created successfully',
            order_id: order_id,
            db_order_id: db_order_id
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
});

// Get order by order_id
app.get('/api/orders/:order_id', async (req, res) => {
    try {
        const { order_id } = req.params;
        
        const query = `
            SELECT 
                o.*,
                json_agg(
                    json_build_object(
                        'product_name', oi.product_name,
                        'variant_details', oi.variant_details,
                        'quantity', oi.quantity,
                        'unit_price', oi.unit_price,
                        'total_price', oi.total_price
                    )
                ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.order_id = $1
            GROUP BY o.id;
        `;
        
        const result = await pool.query(query, [order_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        res.json({ success: true, order: result.rows[0] });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

// Get low stock items
app.get('/api/inventory/low-stock', async (req, res) => {
    try {
        const query = `SELECT * FROM low_stock_items;`;
        const result = await pool.query(query);
        
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching low stock items:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get out of stock items
app.get('/api/inventory/out-of-stock', async (req, res) => {
    try {
        const query = `SELECT * FROM out_of_stock_items;`;
        const result = await pool.query(query);
        
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching out of stock items:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update inventory (restock)
app.post('/api/inventory/restock', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { variant_id, quantity, notes, created_by } = req.body;
        
        // Get current stock
        const stockQuery = `SELECT stock_quantity FROM product_variants WHERE id = $1;`;
        const stockResult = await client.query(stockQuery, [variant_id]);
        
        if (stockResult.rows.length === 0) {
            throw new Error('Variant not found');
        }
        
        const previousStock = stockResult.rows[0].stock_quantity;
        const newStock = previousStock + quantity;
        
        // Update stock
        const updateQuery = `
            UPDATE product_variants 
            SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2;
        `;
        await client.query(updateQuery, [newStock, variant_id]);
        
        // Log transaction
        const transactionQuery = `
            INSERT INTO inventory_transactions (
                variant_id, transaction_type, quantity_change,
                previous_quantity, new_quantity, notes, created_by
            ) VALUES ($1, 'restock', $2, $3, $4, $5, $6);
        `;
        await client.query(transactionQuery, [
            variant_id, quantity, previousStock, newStock, notes, created_by || 'admin'
        ]);
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Inventory restocked successfully',
            previous_stock: previousStock,
            new_stock: newStock
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error restocking inventory:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// ADMIN - CREATE PRODUCT
// ============================================

app.post('/admin/products', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { name, category, base_price, image_url, description } = req.body;
        
        // Validation
        if (!name || !category || !base_price) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name, category, and base_price are required' 
            });
        }
        
        // Insert product
        const result = await client.query(`
            INSERT INTO products (name, category, base_price, image_url, description)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, category, base_price, image_url, description, created_at
        `, [name, category, base_price, image_url || null, description || null]);
        
        res.json({ 
            success: true, 
            product: result.rows[0],
            message: 'Product created successfully' 
        });
        
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// ADMIN - ADD PRODUCT VARIANT
// ============================================

app.post('/admin/products/:productId/variants', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { productId } = req.params;
        const { variant_type, variant_value, stock_quantity, sku, price_modifier } = req.body;
        
        // Validation
        if (!variant_type || !variant_value) {
            return res.status(400).json({ 
                success: false, 
                error: 'variant_type and variant_value are required' 
            });
        }
        
        // Check if product exists
        const productCheck = await client.query(
            'SELECT id FROM products WHERE id = $1',
            [productId]
        );
        
        if (productCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }
        
        // Insert variant
        const result = await client.query(`
            INSERT INTO product_variants 
            (product_id, variant_type, variant_value, stock_quantity, sku, price_modifier)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, product_id, variant_type, variant_value, stock_quantity, sku, price_modifier, created_at
        `, [
            productId, 
            variant_type, 
            variant_value, 
            stock_quantity || 0, 
            sku || null, 
            price_modifier || 0
        ]);
        
        // Log initial stock
        if (stock_quantity > 0) {
            await client.query(`
                INSERT INTO inventory_transactions 
                (variant_id, transaction_type, quantity_change, previous_quantity, new_quantity, notes, created_by)
                VALUES ($1, 'restock', $2, 0, $2, 'Initial stock', 'admin')
            `, [result.rows[0].id, stock_quantity]);
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            variant: result.rows[0],
            message: 'Variant added successfully' 
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Add variant error:', error);
        
        // Handle unique constraint violation
        if (error.code === '23505') {
            return res.status(400).json({ 
                success: false, 
                error: 'This variant already exists for this product' 
            });
        }
        
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// ADMIN - DELETE PRODUCT
// ============================================

app.delete('/admin/products/:productId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { productId } = req.params;
        
        const result = await client.query(
            'DELETE FROM products WHERE id = $1 RETURNING id',
            [productId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Product deleted successfully' 
        });
        
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Trendy VybzTech API is running' });
});

// Admin routes
const adminRoutes = require('./admin-routes');
app.use('/admin', adminRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 Inventory API ready`);
    console.log(`🔐 Admin panel ready at /admin`);
});

module.exports = app;
