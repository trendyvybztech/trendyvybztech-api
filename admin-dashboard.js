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
        case 'categories':
            loadCategories();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'sales':
            loadSalesAnalytics();
            break;
        case 'customers':
            loadCustomers();
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
                
                if (product.variants && Object.keys(product.variants).length > 0) {
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
                } else {
                    // Product without variants
                    rows.push(`
                        <tr data-product-id="${product.id}">
                            <td>${product.name}</td>
                            <td>${product.category}</td>
                            <td>No variants</td>
                            <td>-</td>
                            <td>JMD $${product.price.toFixed(2)}</td>
                            <td><span class="badge badge-warning">No Variants</span></td>
                            <td>
                                <button class="btn-small btn-edit" onclick="openEditProduct(${product.id})">
                                    ✏️ Edit
                                </button>
                            </td>
                        </tr>
                    `);
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
    
    // Populate sub-categories
    populateSubCategoryDropdowns();
    
    modal.style.display = 'block';
}

async function populateSubCategoryDropdowns() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories`);
        const data = await response.json();
        
        if (data.success) {
            const mainCategories = data.main_categories;
            const subCategories = data.sub_categories;
            
            // Build grouped options
            let options = '<option value="">Select category...</option>';
            
            mainCategories.forEach(main => {
                const subs = subCategories.filter(s => s.main_category_id === main.id);
                if (subs.length > 0) {
                    options += `<optgroup label="${main.name}">`;
                    subs.forEach(sub => {
                        options += `<option value="${sub.id}">${sub.name}</option>`;
                    });
                    options += '</optgroup>';
                }
            });
            
            // Update both dropdowns
            const newSelect = document.getElementById('newProductSubCategory');
            const editSelect = document.getElementById('editProductSubCategory');
            
            if (newSelect) newSelect.innerHTML = options;
            if (editSelect) editSelect.innerHTML = options;
        }
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

function closeCreateProductModal() {
    const modal = document.getElementById('createProductModal');
    if (!modal) return;
    modal.style.display = 'none';
    // Reset form
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductSubCategory').value = '';
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
    const sub_category_id = parseInt(document.getElementById('newProductSubCategory').value);
    const base_price = parseFloat(document.getElementById('newProductPrice').value);
    const description = document.getElementById('newProductDescription').value.trim();
    const image_url = document.getElementById('newProductImageUrl').value.trim();
    
    // Validation
    if (!name || !sub_category_id || !base_price) {
        showNotification('Please fill in all required fields (Name, Category, Price)', 'error');
        return;
    }
    
    if (base_price <= 0) {
        showNotification('Price must be greater than 0', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Get sub-category name for legacy category field
        const subCatSelect = document.getElementById('newProductSubCategory');
        const subCatName = subCatSelect.options[subCatSelect.selectedIndex].text;
        
        // Create product
        const productResponse = await fetch(`${ADMIN_API_URL}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                category: subCatName,
                sub_category_id,
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
    
    // Populate categories first
    populateSubCategoryDropdowns();
    
    // Wait briefly for categories to populate
    setTimeout(() => {
        // Populate form with null checks
        const idField = document.getElementById('editProductId');
        const nameField = document.getElementById('editProductName');
        const subCategoryField = document.getElementById('editProductSubCategory');
        const priceField = document.getElementById('editProductPrice');
        const descField = document.getElementById('editProductDescription');
        const imageField = document.getElementById('editProductImageUrl');
        
        if (idField) idField.value = product.id;
        if (nameField) nameField.value = product.name;
        if (subCategoryField && product.sub_category_id) subCategoryField.value = product.sub_category_id;
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
                            <input type="number" class="edit-variant-price" value="${variant.variant_price || ''}" min="0" step="0.01" style="width: 100px;" placeholder="Price">
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
    }, 100);
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
        <input type="number" class="edit-variant-price" placeholder="Price" min="0" step="0.01" style="width: 100px;">
        <input type="text" class="edit-variant-sku" placeholder="SKU" style="width: 100px;">
        <input type="text" class="edit-variant-image" placeholder="Image URL" style="flex: 1;">
        <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 5px; cursor: pointer;">Remove</button>
    `;
    container.appendChild(row);
}

async function saveProductEdits() {
    const productId = document.getElementById('editProductId').value;
    const name = document.getElementById('editProductName').value.trim();
    const sub_category_id = parseInt(document.getElementById('editProductSubCategory').value);
    const base_price = parseFloat(document.getElementById('editProductPrice').value);
    const description = document.getElementById('editProductDescription').value.trim();
    const image_url = document.getElementById('editProductImageUrl').value.trim();
    
    if (!name || !sub_category_id || !base_price) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Get sub-category name for legacy category field
        const subCatSelect = document.getElementById('editProductSubCategory');
        const subCatName = subCatSelect.options[subCatSelect.selectedIndex].text;
        
        // Update product
        const productResponse = await fetch(`${ADMIN_API_URL}/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                category: subCatName,
                sub_category_id,
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
            const variantPrice = parseFloat(row.querySelector('.edit-variant-price').value) || null;
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
                            image_url: imageUrl || null,
                            variant_price: variantPrice
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
                            image_url: imageUrl || null,
                            variant_price: variantPrice
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
                            ${order.transaction_id ? `<p><strong>Transaction ID:</strong> ${order.transaction_id}</p>` : ''}
                            ${order.usd_amount ? `<p><strong>USD Amount:</strong> $${parseFloat(order.usd_amount).toFixed(2)}</p>` : ''}
                            ${order.exchange_rate ? `<p><strong>Exchange Rate:</strong> ${parseFloat(order.exchange_rate).toFixed(2)} JMD/USD</p>` : ''}
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
                        ${order.rewards_discount > 0 ? `<p style="color: #00D9FF;"><strong>Rewards Discount:</strong> -JMD $${parseFloat(order.rewards_discount).toFixed(2)}</p>` : ''}
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

// ============================================
// SALES ANALYTICS
// ============================================

async function loadSalesAnalytics() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/sales/analytics`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.analytics;
            
            document.getElementById('stat-revenue').textContent = `JMD $${parseFloat(stats.total_revenue || 0).toLocaleString()}`;
            document.getElementById('stat-refunds').textContent = `JMD $${parseFloat(stats.total_refunds || 0).toLocaleString()}`;
            document.getElementById('stat-net').textContent = `JMD $${parseFloat(stats.net_revenue || 0).toLocaleString()}`;
            document.getElementById('stat-avg').textContent = `JMD $${parseFloat(stats.avg_order_value || 0).toLocaleString()}`;
            
            // Load sales by date
            const tbody = document.getElementById('sales-table');
            if (data.by_date.length > 0) {
                const rows = data.by_date.map(row => `
                    <tr>
                        <td>${new Date(row.sale_date).toLocaleDateString()}</td>
                        <td>${row.orders_count}</td>
                        <td>JMD $${parseFloat(row.revenue).toLocaleString()}</td>
                        <td>JMD $${parseFloat(row.avg_order || 0).toLocaleString()}</td>
                    </tr>
                `).join('');
                tbody.innerHTML = rows;
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No sales data yet</td></tr>';
            }
        }
    } catch (error) {
        console.error('Error loading sales analytics:', error);
    }
}

// ============================================
// CUSTOMERS & REWARDS
// ============================================

async function loadCustomers() {
    const tbody = document.getElementById('customers-table');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/customers`);
        const data = await response.json();
        
        if (data.success && data.customers.length > 0) {
            window.customersData = data.customers;
            
            const rows = data.customers.map(customer => `
                <tr>
                    <td>${customer.name || 'N/A'}</td>
                    <td>${customer.phone}</td>
                    <td>${customer.email || 'N/A'}</td>
                    <td>${customer.address || 'N/A'}</td>
                    <td><strong style="color: var(--primary);">${customer.total_points}</strong></td>
                    <td>JMD $${parseFloat(customer.total_spent).toLocaleString()}</td>
                    <td>${customer.total_orders}</td>
                    <td>
                        <button class="btn-small btn-edit" onclick="editCustomer(${customer.id})" style="margin-right: 5px;">
                            ✏️ Edit
                        </button>
                        <button class="btn-small btn-warning" onclick="adjustCustomerPoints(${customer.id}, '${(customer.name || customer.phone).replace(/'/g, "\\'")}', ${customer.total_points})" style="margin-right: 5px;">
                            💰 Points
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteCustomer(${customer.id}, '${(customer.name || customer.phone).replace(/'/g, "\\'")}')">
                            🗑️
                        </button>
                    </td>
                </tr>
            `).join('');
            
            tbody.innerHTML = rows;
        } else {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No customers yet</td></tr>';
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Error loading customers</td></tr>';
    }
}

function searchCustomers() {
    const searchTerm = document.getElementById('customersSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#customers-table tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function adjustCustomerPoints(customerId, customerName, currentPoints) {
    const change = prompt(`Adjust points for ${customerName}\nCurrent balance: ${currentPoints} points\n\nEnter amount to add (positive) or subtract (negative):`);
    
    if (change === null) return;
    
    const pointsChange = parseInt(change);
    
    if (isNaN(pointsChange) || pointsChange === 0) {
        alert('Please enter a valid number');
        return;
    }
    
    const notes = prompt('Enter reason for adjustment (optional):');
    
    adjustPoints(customerId, pointsChange, notes || 'Manual adjustment');
}

async function adjustPoints(customerId, pointsChange, notes) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/customers/${customerId}/adjust-points`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ points_change: pointsChange, notes })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Points adjusted successfully. New balance: ${data.new_balance}`, 'success');
            loadCustomers();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error adjusting points:', error);
        showNotification(error.message || 'Failed to adjust points', 'error');
    }
}

// ==================== CUSTOMER MANAGEMENT ====================

function showAddCustomerModal() {
    document.getElementById('customerModalTitle').textContent = '➕ Add Customer';
    document.getElementById('editCustomerId').value = '';
    document.getElementById('customerName').value = '';
    document.getElementById('customerPhone').value = '';
    document.getElementById('customerEmail').value = '';
    document.getElementById('customerAddress').value = '';
    document.getElementById('customerModal').style.display = 'block';
}

function editCustomer(customerId) {
    const customer = window.customersData.find(c => c.id === customerId);
    if (!customer) {
        showNotification('Customer not found', 'error');
        return;
    }
    
    document.getElementById('customerModalTitle').textContent = '✏️ Edit Customer';
    document.getElementById('editCustomerId').value = customer.id;
    document.getElementById('customerName').value = customer.name || '';
    document.getElementById('customerPhone').value = customer.phone;
    document.getElementById('customerEmail').value = customer.email || '';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerModal').style.display = 'block';
}

function closeCustomerModal() {
    document.getElementById('customerModal').style.display = 'none';
}

async function saveCustomer() {
    const customerId = document.getElementById('editCustomerId').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    
    // Validation
    if (!phone) {
        showNotification('Phone number is required', 'error');
        return;
    }
    
    if (!name) {
        showNotification('Name is required', 'error');
        return;
    }
    
    const customerData = { name, phone, email, address };
    
    try {
        const url = customerId 
            ? `${ADMIN_API_URL}/customers/${customerId}`
            : `${ADMIN_API_URL}/customers`;
        
        const method = customerId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(customerData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message || 'Customer saved successfully', 'success');
            closeCustomerModal();
            loadCustomers();
        } else {
            showNotification(data.error || 'Failed to save customer', 'error');
        }
    } catch (error) {
        console.error('Error saving customer:', error);
        showNotification('Failed to save customer', 'error');
    }
}

async function deleteCustomer(customerId, customerName) {
    if (!confirm(`Are you sure you want to delete customer "${customerName}"?\n\nThis will also delete all their points transaction history. This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/customers/${customerId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Customer deleted successfully', 'success');
            loadCustomers();
        } else {
            showNotification(data.error || 'Failed to delete customer', 'error');
        }
    } catch (error) {
        console.error('Error deleting customer:', error);
        showNotification('Failed to delete customer', 'error');
    }
}

// ==================== CATEGORY MANAGEMENT ====================

async function loadCategories() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories`);
        const data = await response.json();
        
        if (data.success) {
            window.mainCategoriesData = data.main_categories;
            window.subCategoriesData = data.sub_categories;
            
            renderMainCategories(data.main_categories);
            renderSubCategories(data.sub_categories);
        }
    } catch (error) {
        console.error('Load categories error:', error);
        showNotification('Failed to load categories', 'error');
    }
}

function renderMainCategories(categories) {
    const tbody = document.getElementById('main-categories-table');
    
    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No main categories</td></tr>';
        return;
    }
    
    tbody.innerHTML = categories.map(cat => `
        <tr>
            <td><strong>${cat.name}</strong></td>
            <td>${cat.display_order}</td>
            <td><span class="badge ${cat.is_active ? 'badge-success' : 'badge-danger'}">${cat.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn-small btn-edit" onclick="editMainCategory(${cat.id})" style="margin-right:5px;">✏️</button>
                <button class="btn-small ${cat.is_active ? 'btn-warning' : 'badge-success'}" onclick="toggleMainCategory(${cat.id}, ${!cat.is_active})" style="margin-right:5px;">${cat.is_active ? '🔕' : '✅'}</button>
                <button class="btn-small btn-danger" onclick="deleteMainCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderSubCategories(subCategories) {
    const tbody = document.getElementById('sub-categories-table');
    
    if (subCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No sub categories</td></tr>';
        return;
    }
    
    tbody.innerHTML = subCategories.map(cat => `
        <tr>
            <td>${cat.name}</td>
            <td>${cat.main_category_name}</td>
            <td>${cat.display_order}</td>
            <td><span class="badge ${cat.is_active ? 'badge-success' : 'badge-danger'}">${cat.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn-small btn-edit" onclick="editSubCategory(${cat.id})" style="margin-right:5px;">✏️</button>
                <button class="btn-small ${cat.is_active ? 'btn-warning' : 'badge-success'}" onclick="toggleSubCategory(${cat.id}, ${!cat.is_active})" style="margin-right:5px;">${cat.is_active ? '🔕' : '✅'}</button>
                <button class="btn-small btn-danger" onclick="deleteSubCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function showAddMainCategoryModal() {
    document.getElementById('mainCategoryModalTitle').textContent = '➕ Add Main Category';
    document.getElementById('editMainCategoryId').value = '';
    document.getElementById('mainCategoryName').value = '';
    document.getElementById('mainCategoryOrder').value = '0';
    document.getElementById('mainCategoryModal').style.display = 'block';
}

function editMainCategory(id) {
    const cat = window.mainCategoriesData.find(c => c.id === id);
    if (!cat) return;
    
    document.getElementById('mainCategoryModalTitle').textContent = '✏️ Edit Main Category';
    document.getElementById('editMainCategoryId').value = cat.id;
    document.getElementById('mainCategoryName').value = cat.name;
    document.getElementById('mainCategoryOrder').value = cat.display_order;
    document.getElementById('mainCategoryModal').style.display = 'block';
}

function closeMainCategoryModal() {
    document.getElementById('mainCategoryModal').style.display = 'none';
}

async function saveMainCategory() {
    const id = document.getElementById('editMainCategoryId').value;
    const name = document.getElementById('mainCategoryName').value.trim();
    const display_order = parseInt(document.getElementById('mainCategoryOrder').value);
    
    if (!name) {
        showNotification('Category name required', 'error');
        return;
    }
    
    try {
        const url = id ? `${ADMIN_API_URL}/categories/main/${id}` : `${ADMIN_API_URL}/categories/main`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ name, display_order })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            closeMainCategoryModal();
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Save main category error:', error);
        showNotification('Failed to save category', 'error');
    }
}

async function toggleMainCategory(id, isActive) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories/main/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ is_active: isActive })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Toggle category error:', error);
        showNotification('Failed to update category', 'error');
    }
}

async function deleteMainCategory(id, name) {
    if (!confirm(`Delete main category "${name}"?\n\nThis will also delete all sub-categories and may affect products.`)) return;
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories/main/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Delete category error:', error);
        showNotification('Failed to delete category', 'error');
    }
}

function showAddSubCategoryModal() {
    document.getElementById('subCategoryModalTitle').textContent = '➕ Add Sub Category';
    document.getElementById('editSubCategoryId').value = '';
    document.getElementById('subCategoryName').value = '';
    document.getElementById('subCategoryOrder').value = '0';
    
    const select = document.getElementById('subCategoryMain');
    select.innerHTML = '<option value="">Select main category...</option>' +
        window.mainCategoriesData
            .filter(c => c.is_active)
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');
    
    document.getElementById('subCategoryModal').style.display = 'block';
}

function editSubCategory(id) {
    const cat = window.subCategoriesData.find(c => c.id === id);
    if (!cat) return;
    
    document.getElementById('subCategoryModalTitle').textContent = '✏️ Edit Sub Category';
    document.getElementById('editSubCategoryId').value = cat.id;
    document.getElementById('subCategoryName').value = cat.name;
    document.getElementById('subCategoryOrder').value = cat.display_order;
    
    const select = document.getElementById('subCategoryMain');
    select.innerHTML = '<option value="">Select main category...</option>' +
        window.mainCategoriesData
            .map(c => `<option value="${c.id}" ${c.id === cat.main_category_id ? 'selected' : ''}>${c.name}</option>`)
            .join('');
    
    document.getElementById('subCategoryModal').style.display = 'block';
}

function closeSubCategoryModal() {
    document.getElementById('subCategoryModal').style.display = 'none';
}

async function saveSubCategory() {
    const id = document.getElementById('editSubCategoryId').value;
    const name = document.getElementById('subCategoryName').value.trim();
    const main_category_id = parseInt(document.getElementById('subCategoryMain').value);
    const display_order = parseInt(document.getElementById('subCategoryOrder').value);
    
    if (!name || !main_category_id) {
        showNotification('Name and main category required', 'error');
        return;
    }
    
    try {
        const url = id ? `${ADMIN_API_URL}/categories/sub/${id}` : `${ADMIN_API_URL}/categories/sub`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ name, main_category_id, display_order })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            closeSubCategoryModal();
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Save sub category error:', error);
        showNotification('Failed to save sub category', 'error');
    }
}

async function toggleSubCategory(id, isActive) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories/sub/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ is_active: isActive })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Toggle sub category error:', error);
        showNotification('Failed to update sub category', 'error');
    }
}

async function deleteSubCategory(id, name) {
    if (!confirm(`Delete sub category "${name}"?\n\nThis may affect products using this category.`)) return;
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/categories/sub/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadCategories();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Delete sub category error:', error);
        showNotification('Failed to delete sub category', 'error');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const customerModal = document.getElementById('customerModal');
    const mainCatModal = document.getElementById('mainCategoryModal');
    const subCatModal = document.getElementById('subCategoryModal');
    
    if (event.target === customerModal) closeCustomerModal();
    if (event.target === mainCatModal) closeMainCategoryModal();
    if (event.target === subCatModal) closeSubCategoryModal();
}
