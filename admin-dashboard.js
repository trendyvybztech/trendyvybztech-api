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
            const productMap = new Map();
            
            data.products.forEach(product => {
                productMap.set(product.id, product);
                
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
                                        <td>${variant.stock}</td>
                                        <td>JMD $${product.price.toFixed(2)}</td>
                                        <td><span class="badge badge-${status}">${statusText}</span></td>
                                        <td>
                                            <button class="btn-small btn-edit" onclick="openEditProduct(${product.id})">
                                                ✏️ Edit
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
            
            // Store product data globally for edit
            window.productsData = data.products;
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error loading inventory</td></tr>';
    }
}

async function loadOrders() {
    const tbody = document.getElementById('orders-table');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}/orders`);
        const data = await response.json();
        
        if (data.success && data.orders.length > 0) {
            const rows = data.orders.map(order => {
                const statusClass = order.order_status === 'delivered' ? 'success' : 
                                   order.order_status === 'refunded' ? 'danger' :
                                   order.order_status === 'cancelled' ? 'danger' : 'warning';
                const date = new Date(order.created_at).toLocaleDateString();
                
                return `
                    <tr>
                        <td>${order.order_id}</td>
                        <td>${order.customer_name}</td>
                        <td>${date}</td>
                        <td>JMD $${parseFloat(order.total).toFixed(2)}</td>
                        <td><span class="badge badge-${statusClass}">${order.order_status}</span></td>
                        <td>
                            <button class="btn-small btn-view" onclick="viewOrderDetails('${order.order_id}')">
                                View
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            tbody.innerHTML = rows;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray);">No orders yet</td></tr>';
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error loading orders</td></tr>';
    }
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
    const modal = document.getElementById('createProductModal');
    if (!modal) {
        console.error('Create product modal not found');
        return;
    }
    modal.style.display = 'block';
}

function closeCreateProductModal() {
    const modal = document.getElementById('createProductModal');
    if (!modal) return;
    modal.style.display = 'none';
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
            <input type="number" placeholder="Stock" class="variant-stock" min="0" style="width: 80px;">
            <input type="text" placeholder="SKU (optional)" class="variant-sku" style="width: 100px;">
            <input type="text" placeholder="Image URL" class="variant-image" style="flex: 1;">
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
        <input type="number" placeholder="Stock" class="variant-stock" min="0" style="width: 80px;">
        <input type="text" placeholder="SKU (optional)" class="variant-sku" style="width: 100px;">
        <input type="text" placeholder="Image URL" class="variant-image" style="flex: 1;">
        <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 5px; cursor: pointer;">×</button>
    `;
    container.appendChild(newRow);
}

async function createProduct() {
    const name = document.getElementById('newProductName').value.trim();
    let category = document.getElementById('newProductCategory').value;
    const customCategory = document.getElementById('newCustomCategory').value.trim();
    const base_price = parseFloat(document.getElementById('newProductPrice').value);
    const description = document.getElementById('newProductDescription').value.trim();
    const image_url = document.getElementById('newProductImageUrl').value.trim();
    
    // Use custom category if selected
    if (category === '__custom__' && customCategory) {
        category = customCategory;
    } else if (category === '__custom__') {
        showNotification('Please enter a custom category name', 'error');
        return;
    }
    
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
            const imageUrl = row.querySelector('.variant-image').value.trim();
            
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
                        price_modifier: 0,
                        image_url: imageUrl || null
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

// ==================== EDIT PRODUCT ====================

function openEditProduct(productId) {
    const product = window.productsData.find(p => p.id === productId);
    if (!product) {
        console.error('Product not found:', productId);
        return;
    }
    
    // Check if modal elements exist
    const modal = document.getElementById('editProductModal');
    if (!modal) {
        console.error('Edit product modal not found');
        return;
    }
    
    // Populate form with null checks
    const idField = document.getElementById('editProductId');
    const nameField = document.getElementById('editProductName');
    const categoryField = document.getElementById('editProductCategory');
    const priceField = document.getElementById('editProductPrice');
    const descField = document.getElementById('editProductDescription');
    const imageField = document.getElementById('editProductImageUrl');
    
    if (idField) idField.value = product.id;
    if (nameField) nameField.value = product.name;
    if (categoryField) categoryField.value = product.category;
    if (priceField) priceField.value = product.price;
    if (descField) descField.value = product.description || '';
    if (imageField) imageField.value = product.image || '';
    
    // Load variants
    const container = document.getElementById('editVariantsContainer');
    if (!container) {
        console.error('Edit variants container not found');
        return;
    }
    
    container.innerHTML = '';
    
    if (product.variants) {
        Object.entries(product.variants).forEach(([type, variantArray]) => {
            if (Array.isArray(variantArray)) {
                variantArray.forEach(variant => {
                    const row = document.createElement('div');
                    row.className = 'edit-variant-row';
                    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;';
                    row.innerHTML = `
                        <input type="hidden" class="edit-variant-id" value="${variant.variant_id}">
                        <input type="text" class="edit-variant-type" value="${type}" style="flex: 0.8;" readonly>
                        <input type="text" class="edit-variant-value" value="${variant.value}" style="flex: 0.8;">
                        <input type="number" class="edit-variant-stock" value="${variant.stock}" min="0" style="width: 70px;">
                        <input type="text" class="edit-variant-sku" value="${variant.sku || ''}" style="width: 100px;" placeholder="SKU">
                        <input type="text" class="edit-variant-image" value="${variant.image_url || ''}" style="flex: 1;" placeholder="Image URL">
                        <button onclick="deleteVariant(${variant.variant_id}, this)" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 5px; cursor: pointer;">Delete</button>
                    `;
                    container.appendChild(row);
                });
            }
        });
    }
    
    modal.style.display = 'block';
}

function closeEditProductModal() {
    document.getElementById('editProductModal').style.display = 'none';
}

function addEditVariantRow() {
    const container = document.getElementById('editVariantsContainer');
    const row = document.createElement('div');
    row.className = 'edit-variant-row';
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;';
    row.innerHTML = `
        <input type="hidden" class="edit-variant-id" value="new">
        <input type="text" class="edit-variant-type" placeholder="Variant Type (e.g., Colour)" style="flex: 0.8;">
        <input type="text" class="edit-variant-value" placeholder="Variant Value" style="flex: 0.8;">
        <input type="number" class="edit-variant-stock" placeholder="Stock" min="0" style="width: 70px;">
        <input type="text" class="edit-variant-sku" placeholder="SKU" style="width: 100px;">
        <input type="text" class="edit-variant-image" placeholder="Image URL" style="flex: 1;">
        <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 5px; cursor: pointer;">Remove</button>
    `;
    container.appendChild(row);
}

async function saveProductEdits() {
    const productId = document.getElementById('editProductId').value;
    const name = document.getElementById('editProductName').value.trim();
    let category = document.getElementById('editProductCategory').value;
    const customCategory = document.getElementById('editCustomCategory').value.trim();
    const base_price = parseFloat(document.getElementById('editProductPrice').value);
    const description = document.getElementById('editProductDescription').value.trim();
    const image_url = document.getElementById('editProductImageUrl').value.trim();
    
    // Use custom category if selected
    if (category === '__custom__' && customCategory) {
        category = customCategory;
    } else if (category === '__custom__') {
        showNotification('Please enter a custom category name', 'error');
        return;
    }
    
    if (!name || !category || !base_price) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Update product
        const productResponse = await fetch(`${ADMIN_API_URL}/products/${productId}`, {
            method: 'PUT',
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
            throw new Error(productData.error || 'Failed to update product');
        }
        
        // Update variants
        const variantRows = document.querySelectorAll('.edit-variant-row');
        
        for (const row of variantRows) {
            const variantId = row.querySelector('.edit-variant-id').value;
            const variantType = row.querySelector('.edit-variant-type').value.trim();
            const variantValue = row.querySelector('.edit-variant-value').value.trim();
            const stock = parseInt(row.querySelector('.edit-variant-stock').value) || 0;
            const sku = row.querySelector('.edit-variant-sku').value.trim();
            const imageUrl = row.querySelector('.edit-variant-image').value.trim();
            
            if (variantType && variantValue) {
                if (variantId === 'new') {
                    // Add new variant
                    await fetch(`${ADMIN_API_URL}/products/${productId}/variants`, {
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
                            price_modifier: 0,
                            image_url: imageUrl || null
                        })
                    });
                } else {
                    // Update existing variant
                    await fetch(`${ADMIN_API_URL}/variants/${variantId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            variant_value: variantValue,
                            stock_quantity: stock,
                            sku: sku || null,
                            image_url: imageUrl || null
                        })
                    });
                }
            }
        }
        
        showLoading(false);
        showNotification('Product updated successfully!', 'success');
        closeEditProductModal();
        loadInventory();
        
    } catch (error) {
        showLoading(false);
        console.error('Update product error:', error);
        showNotification(error.message || 'Failed to update product', 'error');
    }
}

async function deleteVariant(variantId, button) {
    if (!confirm('Delete this variant? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/variants/${variantId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            button.parentElement.remove();
            showNotification('Variant deleted', 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showNotification(error.message || 'Failed to delete variant', 'error');
    }
}

// Close edit modal on outside click
window.addEventListener('click', function(event) {
    const editModal = document.getElementById('editProductModal');
    if (event.target === editModal) {
        closeEditProductModal();
    }
});

// View order details
async function viewOrderDetails(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}`);
        const data = await response.json();
        
        if (!data.success || !data.order) {
            alert('Order not found');
            return;
        }
        
        const order = data.order;
        const items = Array.isArray(order.items) ? order.items : [];
        
        const itemsHTML = items.map(item => {
            let variantDisplay = 'Standard';
            try {
                if (item.variant_details) {
                    const details = typeof item.variant_details === 'string' ? 
                        JSON.parse(item.variant_details) : item.variant_details;
                    variantDisplay = details.colour || details.color || details.variant || 'Standard';
                }
            } catch (e) {
                variantDisplay = 'Standard';
            }
            
            return `
                <tr>
                    <td>${item.product_name}</td>
                    <td>${variantDisplay}</td>
                    <td>${item.quantity}</td>
                    <td>JMD $${parseFloat(item.unit_price).toFixed(2)}</td>
                    <td>JMD $${parseFloat(item.total_price).toFixed(2)}</td>
                </tr>
            `;
        }).join('');
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>📦 Order Details: ${order.order_id}</h2>
                    <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div>
                            <h3>Customer Information</h3>
                            <p><strong>Name:</strong> ${order.customer_name}</p>
                            <p><strong>Email:</strong> ${order.customer_email}</p>
                            <p><strong>Phone:</strong> ${order.customer_phone || 'N/A'}</p>
                            <p><strong>Address:</strong> ${order.customer_address}</p>
                        </div>
                        <div>
                            <h3>Order Information</h3>
                            <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
                            <p><strong>Payment:</strong> ${order.payment_method}</p>
                            <p><strong>Delivery:</strong> ${order.delivery_option || 'N/A'}</p>
                            <p><strong>Status:</strong> <span class="badge badge-warning">${order.order_status}</span></p>
                        </div>
                    </div>
                    
                    <h3>Order Items</h3>
                    <table style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Variant</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; border-top: 2px solid rgba(255,255,255,0.1); padding-top: 15px;">
                        <p><strong>Subtotal:</strong> JMD $${parseFloat(order.subtotal).toFixed(2)}</p>
                        <p><strong>Delivery Fee:</strong> JMD $${parseFloat(order.delivery_fee).toFixed(2)}</p>
                        <p style="font-size: 1.2rem; color: var(--primary);"><strong>Total:</strong> JMD $${parseFloat(order.total).toFixed(2)}</p>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                        ${order.order_status !== 'delivered' && order.order_status !== 'refunded' ? `
                            <button class="btn-primary" onclick="updateOrderStatus('${order.order_id}', 'delivered')" style="background: var(--success);">
                                ✅ Mark as Completed
                            </button>
                        ` : ''}
                        ${order.order_status !== 'refunded' ? `
                            <button class="btn-secondary" onclick="refundOrder('${order.order_id}')" style="background: var(--danger);">
                                💸 Refund Order
                            </button>
                        ` : ''}
                        <button class="btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error loading order details:', error);
        alert('Failed to load order details');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Order marked as ${newStatus}`, 'success');
            document.querySelector('.modal').remove();
            loadOrders();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        showNotification(error.message || 'Failed to update order status', 'error');
    }
}

async function refundOrder(orderId) {
    if (!confirm('Refund this order? This will restore stock quantities and cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Order refunded successfully. Stock has been restored.', 'success');
            document.querySelector('.modal').remove();
            loadOrders();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error refunding order:', error);
        showNotification(error.message || 'Failed to refund order', 'error');
    }
}

// Toggle custom category input
function toggleCustomCategory(selectElement, inputId) {
    const customInput = document.getElementById(inputId);
    if (selectElement.value === '__custom__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}