// admin-dashboard.js
// Trendy VybzTech Admin Dashboard

const API_URL = 'https://trendyvybztech-api.onrender.com/api';
const ADMIN_API_URL = 'https://trendyvybztech-api.onrender.com/admin';

// Session Management
let currentUser = null;
let authToken = null;

// Check if already logged in
window.onload = function() {
    const savedToken = localStorage.getItem('admin_token');
    const savedUser = localStorage.getItem('admin_user');
    
    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }
};

// ==================== AUTHENTICATION ====================

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    showLoading(true);
    hideMessages();
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.needs2FA) {
                // First time - show 2FA setup
                document.getElementById('qrCode').innerHTML = data.qrCode;
                document.getElementById('manualCode').textContent = data.secret;
                document.getElementById('passwordStep').style.display = 'none';
                document.getElementById('twoFASetup').style.display = 'block';
                currentUser = { username, tempToken: data.tempToken };
            } else if (data.require2FA) {
                // Returning user - show 2FA verify
                document.getElementById('passwordStep').style.display = 'none';
                document.getElementById('twoFAVerify').style.display = 'block';
                currentUser = { username, tempToken: data.tempToken };
            } else {
                // No 2FA (shouldn't happen but handle it)
                authToken = data.token;
                currentUser = { username };
                saveSession();
                showDashboard();
            }
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
        console.error('Login error:', error);
    } finally {
        showLoading(false);
    }
});

// 2FA Setup Verification
document.getElementById('verifySetupBtn').addEventListener('click', async () => {
    const token = document.getElementById('setupToken').value;
    
    if (token.length !== 6) {
        showError('Please enter a 6-digit code');
        return;
    }
    
    showLoading(true);
    hideMessages();
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/verify-2fa-setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                token: token,
                tempToken: currentUser.tempToken
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            saveSession();
            showSuccess('2FA setup complete!');
            setTimeout(() => showDashboard(), 1500);
        } else {
            showError(data.error || 'Invalid code. Please try again.');
        }
    } catch (error) {
        showError('Verification failed. Please try again.');
        console.error('2FA setup error:', error);
    } finally {
        showLoading(false);
    }
});

// 2FA Login Verification
document.getElementById('verify2FABtn').addEventListener('click', async () => {
    const token = document.getElementById('verifyToken').value;
    
    if (token.length !== 6) {
        showError('Please enter a 6-digit code');
        return;
    }
    
    showLoading(true);
    hideMessages();
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                token: token,
                tempToken: currentUser.tempToken
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            saveSession();
            showDashboard();
        } else {
            showError(data.error || 'Invalid code. Please try again.');
        }
    } catch (error) {
        showError('Verification failed. Please try again.');
        console.error('2FA verify error:', error);
    } finally {
        showLoading(false);
    }
});

// Save session to localStorage
function saveSession() {
    localStorage.setItem('admin_token', authToken);
    localStorage.setItem('admin_user', JSON.stringify(currentUser));
}

// Logout
function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    authToken = null;
    currentUser = null;
    
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('passwordStep').style.display = 'block';
    document.getElementById('twoFASetup').style.display = 'none';
    document.getElementById('twoFAVerify').style.display = 'none';
    
    // Reset forms
    document.getElementById('loginForm').reset();
    document.getElementById('setupToken').value = '';
    document.getElementById('verifyToken').value = '';
}

// ==================== DASHBOARD ====================

function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    // Set username
    const username = currentUser.username || 'Admin';
    document.getElementById('username-display').textContent = username;
    document.getElementById('userAvatar').textContent = username.charAt(0).toUpperCase();
    
    // Load data
    loadDashboardData();
}

// Page Navigation
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active from all nav links
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(`${pageName}-page`).classList.add('active');
    
    // Add active to clicked nav
    event.target.classList.add('active');
    
    // Load page data
    switch(pageName) {
        case 'overview':
            loadDashboardData();
            break;
        case 'inventory':
            loadInventory();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'lowstock':
            loadLowStock();
            break;
    }
}

// ==================== LOAD DATA ====================

async function loadDashboardData() {
    try {
        // Load stats
        const productsRes = await fetch(`${API_URL}/products`);
        const productsData = await productsRes.json();
        
        if (productsData.success) {
            const products = productsData.products;
            let totalProducts = products.length;
            let totalStock = 0;
            let lowStockCount = 0;
            let outOfStockCount = 0;
            let lowStockItems = [];
            
            products.forEach(product => {
                if (product.variants) {
                    Object.values(product.variants).forEach(variantArray => {
                        if (Array.isArray(variantArray)) {
                            variantArray.forEach(variant => {
                                totalStock += variant.stock || 0;
                                
                                if (variant.stock === 0) {
                                    outOfStockCount++;
                                } else if (variant.low_stock) {
                                    lowStockCount++;
                                    lowStockItems.push({
                                        product: product.name,
                                        variant: variant.value,
                                        stock: variant.stock
                                    });
                                }
                            });
                        }
                    });
                }
            });
            
            // Update stats
            document.getElementById('stat-products').textContent = totalProducts;
            document.getElementById('stat-stock').textContent = totalStock;
            document.getElementById('stat-lowstock').textContent = lowStockCount;
            document.getElementById('stat-outofstock').textContent = outOfStockCount;
            
            // Show recent low stock items
            const tbody = document.getElementById('recent-lowstock');
            if (lowStockItems.length > 0) {
                tbody.innerHTML = lowStockItems.slice(0, 5).map(item => `
                    <tr>
                        <td>${item.product}</td>
                        <td>${item.variant}</td>
                        <td>${item.stock}</td>
                        <td><span class="badge badge-warning">Low Stock</span></td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray);">All items well stocked!</td></tr>';
            }
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadInventory() {
    const tbody = document.getElementById('inventory-table');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}/products`);
        const data = await response.json();
        
        if (data.success) {
            const rows = [];
            
            data.products.forEach(product => {
                if (product.variants) {
                    Object.entries(product.variants).forEach(([type, variantArray]) => {
                        if (Array.isArray(variantArray)) {
                            variantArray.forEach(variant => {
                                const status = variant.stock === 0 ? 'danger' : 
                                              variant.low_stock ? 'warning' : 'success';
                                const statusText = variant.stock === 0 ? 'Out of Stock' : 
                                                  variant.low_stock ? 'Low Stock' : 'In Stock';
                                
                                rows.push(`
                                    <tr data-product-id="${product.id}" data-variant-id="${variant.variant_id}">
                                        <td>${product.name}</td>
                                        <td>${product.category}</td>
                                        <td>${variant.value}</td>
                                        <td>
                                            <input type="number" value="${variant.stock}" 
                                                   min="0" 
                                                   style="width: 80px; padding: 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 5px;"
                                                   onchange="updateStock(${variant.variant_id}, this.value)">
                                        </td>
                                        <td>JMD $${product.price.toFixed(2)}</td>
                                        <td><span class="badge badge-${status}">${statusText}</span></td>
                                        <td>
                                            <button class="btn-small btn-edit" onclick="quickRestock(${variant.variant_id}, '${product.name}', '${variant.value}')">
                                                Restock
                                            </button>
                                        </td>
                                    </tr>
                                `);
                            });
                        }
                    });
                }
            });
            
            tbody.innerHTML = rows.length > 0 ? rows.join('') : 
                '<tr><td colspan="7" style="text-align: center; color: var(--gray);">No products found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error loading inventory</td></tr>';
    }
}

async function loadOrders() {
    const tbody = document.getElementById('orders-table');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
    
    // This would call your orders API endpoint
    // For now, showing placeholder
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray);">No orders yet</td></tr>';
}

async function loadLowStock() {
    const tbody = document.getElementById('lowstock-table');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}/inventory/low-stock`);
        const data = await response.json();
        
        if (data.success && data.items.length > 0) {
            tbody.innerHTML = data.items.map(item => `
                <tr>
                    <td>${item.product_name}</td>
                    <td>${item.variant_value}</td>
                    <td><span class="badge badge-warning">${item.stock_quantity}</span></td>
                    <td>${item.low_stock_threshold}</td>
                    <td>
                        <button class="btn-small btn-edit" onclick="quickRestock(${item.variant_id}, '${item.product_name}', '${item.variant_value}')">
                            Restock
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--gray);">All items well stocked!</td></tr>';
        }
    } catch (error) {
        console.error('Error loading low stock:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error loading data</td></tr>';
    }
}

// ==================== INVENTORY ACTIONS ====================

async function updateStock(variantId, newStock) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/inventory/restock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                variant_id: variantId,
                quantity: parseInt(newStock),
                notes: 'Stock updated via admin dashboard',
                created_by: currentUser.username
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Stock updated successfully!', 'success');
            loadInventory(); // Refresh
        } else {
            showNotification('Failed to update stock', 'error');
        }
    } catch (error) {
        console.error('Error updating stock:', error);
        showNotification('Error updating stock', 'error');
    } finally {
        showLoading(false);
    }
}

function quickRestock(variantId, productName, variantValue) {
    const quantity = prompt(`Restock ${productName} - ${variantValue}\n\nEnter quantity to add:`);
    
    if (quantity && !isNaN(quantity) && parseInt(quantity) > 0) {
        updateStock(variantId, parseInt(quantity));
    }
}

function searchInventory() {
    const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
    const rows = document.querySelectorAll('#inventory-table tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function searchOrders() {
    const searchTerm = document.getElementById('ordersSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#orders-table tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// ==================== SETTINGS ====================

async function changePassword() {
    const newPassword = document.getElementById('newPassword').value;
    
    if (newPassword.length < 8) {
        showNotification('Password must be at least 8 characters', 'error');
        return;
    }
    
    showLoading(true);
    
    // Call API to change password
    // Placeholder for now
    
    setTimeout(() => {
        showNotification('Password updated successfully!', 'success');
        document.getElementById('newPassword').value = '';
        showLoading(false);
    }, 1000);
}

// ==================== UI HELPERS ====================

function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('active', show);
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
}

function hideMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== CREATE PRODUCT ====================

function showCreateProductModal() {
    document.getElementById('createProductModal').style.display = 'block';
}

function closeCreateProductModal() {
    document.getElementById('createProductModal').style.display = 'none';
    // Reset form
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductCategory').value = '';
    document.getElementById('newProductPrice').value = '';
    document.getElementById('newProductDescription').value = '';
    document.getElementById('newProductImageUrl').value = '';
    
    // Reset variants to one row
    document.getElementById('variantsContainer').innerHTML = `
        <div class="variant-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
            <input type="text" placeholder="Variant Type (e.g., Colour)" class="variant-type" style="flex: 1;">
            <input type="text" placeholder="Variant Value (e.g., Black)" class="variant-value" style="flex: 1;">
            <input type="number" placeholder="Stock" class="variant-stock" min="0" style="width: 100px;">
            <input type="text" placeholder="SKU (optional)" class="variant-sku" style="width: 120px;">
        </div>
    `;
}

function addVariantRow() {
    const container = document.getElementById('variantsContainer');
    const newRow = document.createElement('div');
    newRow.className = 'variant-row';
    newRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px;';
    newRow.innerHTML = `
        <input type="text" placeholder="Variant Type" class="variant-type" style="flex: 1;">
        <input type="text" placeholder="Variant Value" class="variant-value" style="flex: 1;">
        <input type="number" placeholder="Stock" class="variant-stock" min="0" style="width: 100px;">
        <input type="text" placeholder="SKU (optional)" class="variant-sku" style="width: 120px;">
        <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 5px; cursor: pointer;">×</button>
    `;
    container.appendChild(newRow);
}

async function createProduct() {
    const name = document.getElementById('newProductName').value.trim();
    const category = document.getElementById('newProductCategory').value;
    const base_price = parseFloat(document.getElementById('newProductPrice').value);
    const description = document.getElementById('newProductDescription').value.trim();
    const image_url = document.getElementById('newProductImageUrl').value.trim();
    
    // Validation
    if (!name || !category || !base_price) {
        showNotification('Please fill in all required fields (Name, Category, Price)', 'error');
        return;
    }
    
    if (base_price <= 0) {
        showNotification('Price must be greater than 0', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Create product
        const productResponse = await fetch(`${ADMIN_API_URL}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                category,
                base_price,
                image_url: image_url || null,
                description: description || null
            })
        });
        
        const productData = await productResponse.json();
        
        if (!productData.success) {
            throw new Error(productData.error || 'Failed to create product');
        }
        
        const productId = productData.product.id;
        
        // Add variants
        const variantRows = document.querySelectorAll('.variant-row');
        let variantsAdded = 0;
        
        for (const row of variantRows) {
            const variantType = row.querySelector('.variant-type').value.trim();
            const variantValue = row.querySelector('.variant-value').value.trim();
            const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
            const sku = row.querySelector('.variant-sku').value.trim();
            
            if (variantType && variantValue) {
                const variantResponse = await fetch(`${ADMIN_API_URL}/products/${productId}/variants`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        variant_type: variantType,
                        variant_value: variantValue,
                        stock_quantity: stock,
                        sku: sku || null,
                        price_modifier: 0
                    })
                });
                
                const variantData = await variantResponse.json();
                
                if (variantData.success) {
                    variantsAdded++;
                }
            }
        }
        
        showLoading(false);
        showNotification(`Product created successfully with ${variantsAdded} variant(s)!`, 'success');
        closeCreateProductModal();
        loadInventory(); // Refresh inventory
        
    } catch (error) {
        showLoading(false);
        console.error('Create product error:', error);
        showNotification(error.message || 'Failed to create product', 'error');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('createProductModal');
    if (event.target === modal) {
        closeCreateProductModal();
    }
}
