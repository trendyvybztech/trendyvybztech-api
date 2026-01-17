// admin-routes.js
// Admin authentication and management endpoints

const express = require('express');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcrypt');

const router = express.Router();

// In-memory storage for demo (in production, use database)
const adminUsers = new Map();
const sessions = new Map();

// Default admin credentials (CHANGE THESE!)
const DEFAULT_ADMIN = {
    username: 'admin',
    passwordHash: bcrypt.hashSync('TrendyVybz2025!', 10), // Change this password!
    twoFASecret: null,
    twoFAEnabled: false
};

// Initialize default admin
adminUsers.set('admin', DEFAULT_ADMIN);

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const session = sessions.get(token);
    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ success: false, error: 'Session expired' });
    }
    
    req.user = session.user;
    next();
}

// Generate session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================
// ADMIN LOGIN
// ============================================

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = adminUsers.get(username);
        
        if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        
        // Check if 2FA is enabled
        if (!user.twoFAEnabled) {
            // First time login - generate 2FA secret
            const secret = speakeasy.generateSecret({
                name: `Trendy VybzTech (${username})`,
                length: 20
            });
            
            // Generate QR code
            const qrCode = await QRCode.toDataURL(secret.otpauth_url);
            
            // Store temporary secret
            const tempToken = generateToken();
            sessions.set(tempToken, {
                user: username,
                tempSecret: secret.base32,
                expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes
            });
            
            return res.json({
                success: true,
                needs2FA: true,
                qrCode: `<img src="${qrCode}" alt="QR Code" />`,
                secret: secret.base32,
                tempToken
            });
        }
        
        // Returning user - require 2FA verification
        const tempToken = generateToken();
        sessions.set(tempToken, {
            user: username,
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });
        
        return res.json({
            success: true,
            require2FA: true,
            tempToken
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============================================
// 2FA SETUP VERIFICATION
// ============================================

router.post('/verify-2fa-setup', async (req, res) => {
    try {
        const { username, token, tempToken } = req.body;
        
        const session = sessions.get(tempToken);
        if (!session || session.user !== username || !session.tempSecret) {
            return res.json({ success: false, error: 'Invalid session' });
        }
        
        // Verify token
        const verified = speakeasy.totp.verify({
            secret: session.tempSecret,
            encoding: 'base32',
            token: token,
            window: 2 // Allow 2 time steps before/after
        });
        
        if (!verified) {
            return res.json({ success: false, error: 'Invalid code' });
        }
        
        // Save 2FA secret to user
        const user = adminUsers.get(username);
        user.twoFASecret = session.tempSecret;
        user.twoFAEnabled = true;
        adminUsers.set(username, user);
        
        // Create permanent session
        const authToken = generateToken();
        sessions.delete(tempToken); // Remove temp session
        sessions.set(authToken, {
            user: username,
            expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        });
        
        res.json({ success: true, token: authToken });
        
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============================================
// 2FA LOGIN VERIFICATION
// ============================================

router.post('/verify-2fa', async (req, res) => {
    try {
        const { username, token, tempToken } = req.body;
        
        const session = sessions.get(tempToken);
        if (!session || session.user !== username) {
            return res.json({ success: false, error: 'Invalid session' });
        }
        
        const user = adminUsers.get(username);
        if (!user || !user.twoFASecret) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        // Verify token
        const verified = speakeasy.totp.verify({
            secret: user.twoFASecret,
            encoding: 'base32',
            token: token,
            window: 2
        });
        
        if (!verified) {
            return res.json({ success: false, error: 'Invalid code' });
        }
        
        // Create permanent session
        const authToken = generateToken();
        sessions.delete(tempToken); // Remove temp session
        sessions.set(authToken, {
            user: username,
            expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        });
        
        res.json({ success: true, token: authToken });
        
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============================================
// ADMIN LOGOUT
// ============================================

router.post('/logout', verifyToken, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    sessions.delete(token);
    res.json({ success: true });
});

// ============================================
// CHANGE PASSWORD
// ============================================

router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const username = req.user;
        
        const user = adminUsers.get(username);
        
        if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
            return res.json({ success: false, error: 'Current password incorrect' });
        }
        
        if (newPassword.length < 8) {
            return res.json({ success: false, error: 'Password must be at least 8 characters' });
        }
        
        user.passwordHash = bcrypt.hashSync(newPassword, 10);
        adminUsers.set(username, user);
        
        res.json({ success: true, message: 'Password updated' });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Clean up expired sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (session.expiresAt < now) {
            sessions.delete(token);
        }
    }
}, 5 * 60 * 1000);

module.exports = router;
