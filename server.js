// Force deploy v2 - 2026-01-26
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
                COALESCE(
                    json_agg(
                        json_build_object(
                            'variant_id', pv.id,
                            'type', pv.variant_type,
                            'value', pv.variant_value,
                            'stock', pv.stock_quantity,
                            'low_stock_threshold', pv.low_stock_threshold,
                            'sku', pv.sku,
                            'is_available', pv.is_available,
                            'image_url', COALESCE(pv.image_url, p.image_url, ''),
                            'variant_price', pv.variant_price
                        )
                    ) FILTER (WHERE pv.id IS NOT NULL),
                    '[]'::json
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
                    sku: variant.sku,
                    image_url: variant.image_url,
                    variant_price: variant.variant_price
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
            rewards_discount,
            payment_provider,
            transaction_id,
            payment_status,
            usd_amount,
            exchange_rate,
            order_status,
            items
        } = req.body;
        
        // Insert order
        const orderQuery = `
            INSERT INTO orders (
                order_id, customer_name, customer_email, customer_phone,
                customer_address, subtotal, delivery_fee, total,
                payment_method, delivery_option, delivery_parish, rewards_discount,
                payment_provider, transaction_id, payment_status, usd_amount, exchange_rate,
                order_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING id;
        `;
        
        const orderResult = await client.query(orderQuery, [
            order_id, customer_name, customer_email, customer_phone,
            customer_address, subtotal, delivery_fee, total,
            payment_method, delivery_option, delivery_parish, rewards_discount || 0,
            payment_provider || null, transaction_id || null, payment_status || 'pending',
            usd_amount || null, exchange_rate || null, order_status || 'pending'
        ]);
        
        const db_order_id = orderResult.rows[0].id;
        
        // Insert order items and reduce inventory
        for (const item of items) {
            console.log('Processing item:', item);
            
            // Find variant ID
            const variantQuery = `
                SELECT pv.id, pv.stock_quantity, p.name as product_name
                FROM product_variants pv
                JOIN products p ON p.id = pv.product_id
                WHERE pv.product_id = $1 
                    AND LOWER(pv.variant_type) = LOWER($2)
                    AND LOWER(pv.variant_value) = LOWER($3);
            `;
            
            console.log('Searching for variant:', {
                product_id: item.product_id,
                variant_type: item.variant_type,
                variant_value: item.variant_value
            });
            
            const variantResult = await client.query(variantQuery, [
                item.product_id,
                item.variant_type,
                item.variant_value
            ]);
            
            console.log('Variant search result:', variantResult.rows);
            
            if (variantResult.rows.length === 0) {
                throw new Error(`Variant not found for product ${item.product_id}, type: ${item.variant_type}, value: ${item.variant_value}`);
            }
            
            const variant = variantResult.rows[0];
            
            console.log('Found variant:', variant);
            
            // Check if enough stock
            if (variant.stock_quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${item.product_name}. Available: ${variant.stock_quantity}, Requested: ${item.quantity}`);
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
            console.log(`Reducing stock for variant ${variant.id}: ${variant.stock_quantity} -> ${newStock}`);
            
            const updateStockQuery = `
                UPDATE product_variants 
                SET stock_quantity = $1, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
                RETURNING stock_quantity;
            `;
            
            const updateResult = await client.query(updateStockQuery, [newStock, variant.id]);
            console.log('Stock updated:', updateResult.rows[0]);
            
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
        
        // Track customer and award points (async, don't block order response)
        setImmediate(async () => {
            try {
                const client2 = await pool.connect();
                
                try {
                    // Find or create customer
                    let customer = await client2.query(
                        'SELECT id, total_points FROM customers WHERE phone = $1',
                        [customer_phone]
                    );
                    
                    let customerId;
                    if (customer.rows.length === 0) {
                        // Create new customer
                        const newCustomer = await client2.query(`
                            INSERT INTO customers (phone, name, email, total_points, total_spent, total_orders)
                            VALUES ($1, $2, $3, 0, $4, 1)
                            RETURNING id
                        `, [customer_phone, customer_name, customer_email, total]);
                        customerId = newCustomer.rows[0].id;
                    } else {
                        // Update existing customer
                        customerId = customer.rows[0].id;
                        await client2.query(`
                            UPDATE customers 
                            SET name = $1, email = $2, total_spent = total_spent + $3, total_orders = total_orders + 1, updated_at = NOW()
                            WHERE id = $4
                        `, [customer_name, customer_email, total, customerId]);
                    }
                    
                    // Calculate points (1% of total)
                    const pointsEarned = Math.floor(total / 100);
                    
                    if (pointsEarned > 0) {
                        // Update customer points
                        const updatedCustomer = await client2.query(`
                            UPDATE customers 
                            SET total_points = total_points + $1
                            WHERE id = $2
                            RETURNING total_points
                        `, [pointsEarned, customerId]);
                        
                        // Log points transaction
                        await client2.query(`
                            INSERT INTO points_transactions 
                            (customer_id, order_id, transaction_type, points_change, points_balance, order_total, notes)
                            VALUES ($1, $2, 'earned', $3, $4, $5, 'Points earned from order')
                        `, [customerId, order_id, pointsEarned, updatedCustomer.rows[0].total_points, total]);
                    }
                } finally {
                    client2.release();
                }
            } catch (error) {
                console.error('Error tracking customer/points:', error);
            }
        });
        
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

// Update order status
app.put('/api/orders/:order_id/status', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { order_id } = req.params;
        const { status } = req.body;
        
        const result = await client.query(`
            UPDATE orders 
            SET order_status = $1, updated_at = NOW()
            WHERE order_id = $2
            RETURNING *
        `, [status, order_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        res.json({ success: true, order: result.rows[0] });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Refund order
app.post('/api/orders/:order_id/refund', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { order_id } = req.params;
        
        // Get order details
        const orderQuery = `
            SELECT o.id, o.order_id
            FROM orders o
            WHERE o.order_id = $1
        `;
        
        const orderResult = await client.query(orderQuery, [order_id]);
        
        if (orderResult.rows.length === 0) {
            throw new Error('Order not found');
        }
        
        const order = orderResult.rows[0];
        
        // Get order items
        const itemsQuery = `
            SELECT variant_id, quantity
            FROM order_items
            WHERE order_id = $1
        `;
        
        const itemsResult = await client.query(itemsQuery, [order.id]);
        
        // Restore stock for each item
        for (const item of itemsResult.rows) {
            const stockQuery = `
                SELECT stock_quantity FROM product_variants WHERE id = $1
            `;
            const stockResult = await client.query(stockQuery, [item.variant_id]);
            
            if (stockResult.rows.length > 0) {
                const currentStock = stockResult.rows[0].stock_quantity;
                const newStock = currentStock + item.quantity;
                
                await client.query(`
                    UPDATE product_variants
                    SET stock_quantity = $1, updated_at = NOW()
                    WHERE id = $2
                `, [newStock, item.variant_id]);
                
                // Log transaction
                await client.query(`
                    INSERT INTO inventory_transactions
                    (variant_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_order_id, notes, created_by)
                    VALUES ($1, 'refund', $2, $3, $4, $5, 'Order refunded', 'admin')
                `, [item.variant_id, item.quantity, currentStock, newStock, order_id]);
            }
        }
        
        // Update order status
        await client.query(`
            UPDATE orders
            SET order_status = 'refunded', payment_status = 'refunded', updated_at = NOW()
            WHERE order_id = $1
        `, [order_id]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, message: 'Order refunded and stock restored' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error refunding order:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Get all orders (for admin)
app.get('/api/orders', async (req, res) => {
    try {
        const query = `
            SELECT 
                o.id,
                o.order_id,
                o.customer_name,
                o.customer_email,
                o.customer_phone,
                o.customer_address,
                o.subtotal,
                o.delivery_fee,
                o.total,
                o.payment_method,
                o.payment_status,
                o.order_status,
                o.delivery_option,
                o.delivery_parish,
                o.created_at,
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
            GROUP BY o.id
            ORDER BY o.created_at DESC;
        `;
        
        const result = await pool.query(query);
        
        res.json({ success: true, orders: result.rows });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, error: error.message });
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
        const { variant_type, variant_value, stock_quantity, sku, price_modifier, image_url, variant_price } = req.body;
        
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
            (product_id, variant_type, variant_value, stock_quantity, sku, price_modifier, image_url, variant_price)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, product_id, variant_type, variant_value, stock_quantity, sku, price_modifier, image_url, variant_price, created_at
        `, [
            productId, 
            variant_type, 
            variant_value, 
            stock_quantity || 0, 
            sku || null, 
            price_modifier || 0,
            image_url || null,
            variant_price || null
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

// ============================================
// ADMIN - UPDATE PRODUCT
// ============================================

app.put('/admin/products/:productId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { productId } = req.params;
        const { name, category, base_price, image_url, description } = req.body;
        
        if (!name || !category || !base_price) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name, category, and base_price are required' 
            });
        }
        
        const result = await client.query(`
            UPDATE products 
            SET name = $1, category = $2, base_price = $3, image_url = $4, description = $5, updated_at = NOW()
            WHERE id = $6
            RETURNING id, name, category, base_price, image_url, description, updated_at
        `, [name, category, base_price, image_url, description, productId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }
        
        res.json({ 
            success: true, 
            product: result.rows[0],
            message: 'Product updated successfully' 
        });
        
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// ADMIN - UPDATE VARIANT
// ============================================

app.put('/admin/variants/:variantId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { variantId } = req.params;
        const { variant_value, stock_quantity, sku, image_url, variant_price } = req.body;
        
        if (!variant_value) {
            return res.status(400).json({ 
                success: false, 
                error: 'variant_value is required' 
            });
        }
        
        // Get current stock
        const currentStock = await client.query(
            'SELECT stock_quantity FROM product_variants WHERE id = $1',
            [variantId]
        );
        
        if (currentStock.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }
        
        const previousQty = currentStock.rows[0].stock_quantity;
        const stockChange = stock_quantity - previousQty;
        
        // Update variant
        const result = await client.query(`
            UPDATE product_variants 
            SET variant_value = $1, stock_quantity = $2, sku = $3, image_url = $4, variant_price = $5, updated_at = NOW()
            WHERE id = $6
            RETURNING id, variant_type, variant_value, stock_quantity, sku, image_url, variant_price, updated_at
        `, [variant_value, stock_quantity, sku, image_url, variant_price, variantId]);
        
        // Log stock change if any
        if (stockChange !== 0) {
            await client.query(`
                INSERT INTO inventory_transactions 
                (variant_id, transaction_type, quantity_change, previous_quantity, new_quantity, notes, created_by)
                VALUES ($1, 'adjustment', $2, $3, $4, 'Admin edit', 'admin')
            `, [variantId, stockChange, previousQty, stock_quantity]);
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            variant: result.rows[0],
            message: 'Variant updated successfully' 
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update variant error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// ADMIN - DELETE VARIANT
// ============================================

app.delete('/admin/variants/:variantId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { variantId } = req.params;
        
        const result = await client.query(
            'DELETE FROM product_variants WHERE id = $1 RETURNING id',
            [variantId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Variant deleted successfully' 
        });
        
    } catch (error) {
        console.error('Delete variant error:', error);
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

// ============================================
// CUSTOMERS & REWARDS ENDPOINTS
// ============================================

// Get or create customer by phone
app.post('/api/customers/lookup', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { phone, name, email } = req.body;
        
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number required' });
        }
        
        // Check if customer exists
        let customer = await client.query(
            'SELECT * FROM customers WHERE phone = $1',
            [phone]
        );
        
        if (customer.rows.length === 0) {
            // Create new customer
            customer = await client.query(`
                INSERT INTO customers (phone, name, email, total_points)
                VALUES ($1, $2, $3, 0)
                RETURNING *
            `, [phone, name || null, email || null]);
        } else if (name || email) {
            // Update existing customer info if provided
            customer = await client.query(`
                UPDATE customers 
                SET name = COALESCE($2, name), 
                    email = COALESCE($3, email),
                    updated_at = NOW()
                WHERE phone = $1
                RETURNING *
            `, [phone, name, email]);
        }
        
        res.json({ 
            success: true, 
            customer: customer.rows[0]
        });
        
    } catch (error) {
        console.error('Customer lookup error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Award points after order
app.post('/api/customers/:customerId/award-points', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { customerId } = req.params;
        const { order_id, order_total, points } = req.body;
        
        // Get current points
        const customerResult = await client.query(
            'SELECT total_points FROM customers WHERE id = $1',
            [customerId]
        );
        
        if (customerResult.rows.length === 0) {
            throw new Error('Customer not found');
        }
        
        const currentPoints = customerResult.rows[0].total_points;
        const newPoints = currentPoints + points;
        
        // Update customer points and stats
        await client.query(`
            UPDATE customers 
            SET total_points = $1,
                total_spent = total_spent + $2,
                total_orders = total_orders + 1,
                updated_at = NOW()
            WHERE id = $3
        `, [newPoints, order_total, customerId]);
        
        // Log transaction
        await client.query(`
            INSERT INTO points_transactions 
            (customer_id, order_id, transaction_type, points_change, points_balance, order_total, notes)
            VALUES ($1, $2, 'earned', $3, $4, $5, '1% cashback on order')
        `, [customerId, order_id, points, newPoints, order_total]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            points_earned: points,
            new_balance: newPoints
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Award points error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Redeem points
app.post('/api/customers/:customerId/redeem-points', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { customerId } = req.params;
        const { order_id, points_to_redeem } = req.body;
        
        // Get current points
        const customerResult = await client.query(
            'SELECT total_points FROM customers WHERE id = $1',
            [customerId]
        );
        
        if (customerResult.rows.length === 0) {
            throw new Error('Customer not found');
        }
        
        const currentPoints = customerResult.rows[0].total_points;
        
        if (currentPoints < points_to_redeem) {
            throw new Error('Insufficient points');
        }
        
        const newPoints = currentPoints - points_to_redeem;
        const discount = points_to_redeem; // 1 point = 1 JMD
        
        // Update customer points
        await client.query(`
            UPDATE customers 
            SET total_points = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [newPoints, customerId]);
        
        // Log transaction
        await client.query(`
            INSERT INTO points_transactions 
            (customer_id, order_id, transaction_type, points_change, points_balance, notes)
            VALUES ($1, $2, 'redeemed', $3, $4, 'Redeemed for JMD discount')
        `, [customerId, order_id, -points_to_redeem, newPoints]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            points_redeemed: points_to_redeem,
            discount_amount: discount,
            new_balance: newPoints
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Redeem points error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Get all customers (admin)
app.get('/admin/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, phone, name, email, 
                total_points, total_spent, total_orders,
                created_at, updated_at
            FROM customers
            ORDER BY total_spent DESC
        `);
        
        res.json({ success: true, customers: result.rows });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Adjust customer points (admin)
app.post('/admin/customers/:customerId/adjust-points', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { customerId } = req.params;
        const { points_change, notes } = req.body;
        
        // Get current points
        const customerResult = await client.query(
            'SELECT total_points FROM customers WHERE id = $1',
            [customerId]
        );
        
        if (customerResult.rows.length === 0) {
            throw new Error('Customer not found');
        }
        
        const currentPoints = customerResult.rows[0].total_points;
        const newPoints = currentPoints + points_change;
        
        if (newPoints < 0) {
            throw new Error('Points cannot be negative');
        }
        
        // Update customer points
        await client.query(`
            UPDATE customers 
            SET total_points = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [newPoints, customerId]);
        
        // Log transaction
        await client.query(`
            INSERT INTO points_transactions 
            (customer_id, transaction_type, points_change, points_balance, notes, created_by)
            VALUES ($1, 'adjustment', $2, $3, $4, 'admin')
        `, [customerId, points_change, newPoints, notes || 'Manual adjustment']);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            new_balance: newPoints
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adjust points error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Get sales analytics
app.get('/admin/sales/analytics', async (req, res) => {
    try {
        const analytics = await pool.query('SELECT * FROM sales_analytics');
        const byDate = await pool.query('SELECT * FROM sales_by_date LIMIT 30');
        
        res.json({ 
            success: true, 
            analytics: analytics.rows[0],
            by_date: byDate.rows
        });
    } catch (error) {
        console.error('Sales analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});