const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8195507774:AAGceiXafAcNrzjs9o8j8wr9B-amR4cJX-g';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1735382824';
const TRADINGVIEW_URL = process.env.TRADINGVIEW_URL || 'https://www.tradingview.com/cex-screener/';

// Store last sent pairs to avoid duplicates
let lastSentPairs = new Set();

// Function to send message to Telegram
async function sendToTelegram(message) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        
        console.log('✅ Message sent to Telegram successfully');
        return response.data;
    } catch (error) {
        console.error('❌ Error sending to Telegram:', error.response?.data || error.message);
        throw error;
    }
}

// Function to scrape TradingView data
async function scrapeTradingViewData() {
    let browser;
    try {
        console.log('🔍 Starting TradingView scan...');
        
        // Launch Puppeteer with optimized settings
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('🌐 Navigating to TradingView...');
        
        // Navigate to TradingView screener
        await page.goto(TRADINGVIEW_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ Page loaded, extracting data...');

        // Wait for page to load
        await page.waitForTimeout(10000);

        // Extract data using page evaluation
        const data = await page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('tr');
            
            rows.forEach((row) => {
                try {
                    const cells = row.querySelectorAll('td');
                    const rowText = row.textContent.toLowerCase();
                    
                    // Look for rows with trading data
                    if (cells.length >= 4 && rowText.includes('usdt')) {
                        const symbol = cells[0]?.textContent?.trim() || 'N/A';
                        const price = cells[1]?.textContent?.trim() || 'N/A';
                        const change = cells[2]?.textContent?.trim() || 'N/A';
                        const volume = cells[3]?.textContent?.trim() || 'N/A';
                        
                        // Check for buy signals
                        if (rowText.includes('buy') || rowText.includes('strong') || change.includes('+')) {
                            results.push({
                                symbol,
                                price,
                                change,
                                volume,
                                signal: 'Potential Buy Signal'
                            });
                        }
                    }
                } catch (error) {
                    // Skip row if error
                }
            });
            
            return results;
        });

        console.log(`📈 Found ${data.length} potential signals`);

        // Send alerts if we have data
        if (data.length > 0) {
            let message = `🎯 <b>TRADING SIGNALS FOUND</b> 🎯\n\n`;
            message += `⏰ <i>Scan Time: ${new Date().toLocaleString()}</i>\n`;
            message += `📊 <i>Total Signals: ${data.length}</i>\n\n`;
            
            data.slice(0, 8).forEach((signal) => {
                message += `🔥 <b>${signal.symbol}</b>\n`;
                message += `💰 Price: ${signal.price}\n`;
                message += `📈 Change: ${signal.change}\n`;
                message += `📊 Volume: ${signal.volume}\n`;
                message += `⭐ ${signal.signal}\n`;
                message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            });

            await sendToTelegram(message);
        } else {
            console.log('No signals found in this scan.');
        }

        return data;

    } catch (error) {
        console.error('❌ Error scraping TradingView:', error);
        await sendToTelegram(`❌ Scanner Error: ${error.message}`);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Test function
async function testSetup() {
    console.log('🧪 Testing setup...');
    await sendToTelegram('🤖 Trading Scanner Bot Started Successfully!\n\n' +
                        '✅ Monitoring TradingView Screener\n' +
                        '✅ Scanning every 5 minutes\n' +
                        '✅ Sending signals to Telegram\n\n' +
                        `⏰ Started at: ${new Date().toLocaleString()}`);
}

// Schedule the job to run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    console.log(`\n🕒 Scheduled scan started at ${new Date().toLocaleString()}`);
    await scrapeTradingViewData();
});

// Manual trigger endpoint
app.get('/scan', async (req, res) => {
    try {
        console.log('🔍 Manual scan triggered');
        const results = await scrapeTradingViewData();
        res.json({
            success: true,
            message: `Manual scan completed. Found ${results.length} signals.`,
            data: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Scan failed',
            error: error.message
        });
    }
});

// Test endpoint
app.get('/test', async (req, res) => {
    try {
        await sendToTelegram('🧪 Test message from Trading Scanner Bot\n' +
                           'If you receive this, your bot is working! ✅');
        res.json({ success: true, message: 'Test message sent to Telegram' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ Healthy', 
        service: 'TradingView Scanner',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Trading Scanner Bot Started Successfully!`);
    console.log(`📍 Server running on port ${PORT}`);
    console.log('⏰ Scheduled scans running every 5 minutes...');
    
    // Initial setup test
    setTimeout(() => {
        testSetup();
    }, 5000);
    
    // Initial scan after startup
    setTimeout(() => {
        console.log('🔍 Running initial scan...');
        scrapeTradingViewData();
    }, 10000);
});