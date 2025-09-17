require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('googleapis');
const NodeCache = require('node-cache');
const FormData = require('form-data');

const app = express();
const port = process.env.PORT || 3000;

// Cache to store user conversation states and ticket generation tracking
const userStates = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL
const ticketQueue = new NodeCache({ stdTTL: 1800 }); // 30 minutes for ticket processing

// Middleware
app.use(bodyParser.json());

// Environment variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Registration flow states
const STATES = {
    INITIAL: 'initial',
    PAYMENT_CHECK: 'payment_check',
    AWAITING_PAYMENT: 'awaiting_payment',
    COLLECTING_NAME: 'collecting_name',
    COLLECTING_PHONE: 'collecting_phone',
    COLLECTING_EMAIL: 'collecting_email',
    COLLECTING_CHURCH: 'collecting_church',
    COLLECTING_REFERENCE: 'collecting_reference',
    COLLECTING_SCREENSHOT: 'collecting_screenshot',
    GENERATING_TICKET: 'generating_ticket',
    COMPLETED: 'completed'
};

/**
 * Initialize Google APIs
 */
let sheets, drive;
if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY,
        },
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly'
        ],
    });

    sheets = google.sheets({ version: 'v4', auth });
    drive = google.drive({ version: 'v3', auth });
}

/**
 * Helper function to send a text message to WhatsApp user
 * @param {string} to - Recipient phone number
 * @param {string} text - Message text to send
 */
async function sendMessage(to, text) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: {
                    body: text
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Message sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Helper function to send an image to WhatsApp user
 * @param {string} to - Recipient phone number
 * @param {string} imageUrl - URL of the image to send
 * @param {string} caption - Optional caption for the image
 */
async function sendImage(to, imageUrl, caption = '') {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "image",
                image: {
                    link: imageUrl,
                    caption: caption
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Image sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending image:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Upload image to WhatsApp Media API and send
 * @param {string} to - Recipient phone number
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} caption - Optional caption
 */
async function uploadAndSendImage(to, imageBuffer, caption = '') {
    try {
        // First, upload the image to WhatsApp Media API
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: 'ticket.png', contentType: 'image/png' });
        formData.append('type', 'image/png');
        formData.append('messaging_product', 'whatsapp');

        const uploadResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    ...formData.getHeaders()
                }
            }
        );

        const mediaId = uploadResponse.data.id;
        console.log('Image uploaded, media ID:', mediaId);

        // Then send the image using the media ID
        const sendResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "image",
                image: {
                    id: mediaId,
                    caption: caption
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Image sent successfully via media ID:', sendResponse.data);
        return sendResponse.data;
    } catch (error) {
        console.error('Error uploading/sending image:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Helper function to send interactive buttons
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Main message text
 * @param {Array} buttons - Array of button objects
 */
async function sendButtons(to, bodyText, buttons) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: bodyText
                    },
                    action: {
                        buttons: buttons
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Interactive message sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending interactive message:', error.response?.data || error.message);
        // Fallback to regular text message
        await sendMessage(to, bodyText);
    }
}

/**
 * Send registration data to Apps Script for processing
 * @param {Object} userData - User registration data
 */
async function sendToAppsScript(userData) {
    if (!APPS_SCRIPT_URL) {
        console.error('Apps Script URL not configured');
        return { success: false, error: 'Apps Script URL not configured' };
    }

    try {
        const response = await axios.post(APPS_SCRIPT_URL, {
            action: 'registerUser',
            userData: userData
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Data sent to Apps Script successfully:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error sending to Apps Script:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

// Note: triggerTicketGeneration function removed - now handled directly by sendToAppsScript

/**
 * Find and download the generated ticket image from Google Drive
 * @param {string} userEmail - User's email to find the ticket
 * @param {string} userName - User's name to find the ticket
 */
async function findAndDownloadTicket(userEmail, userName) {
    if (!drive || !GOOGLE_DRIVE_FOLDER_ID) {
        console.error('Google Drive not configured');
        return null;
    }

    try {
        // Search for files in the specified folder
        const response = await drive.files.list({
            q: `parents in '${GOOGLE_DRIVE_FOLDER_ID}' and (name contains '${userName}' or name contains '${userEmail}')`,
            orderBy: 'createdTime desc',
            pageSize: 10,
        });

        const files = response.data.files;
        if (files.length === 0) {
            console.log('No ticket file found');
            return null;
        }

        // Get the most recent file
        const ticketFile = files[0];
        console.log('Found ticket file:', ticketFile.name);

        // Download the file
        const fileResponse = await drive.files.get({
            fileId: ticketFile.id,
            alt: 'media'
        }, { responseType: 'stream' });

        // Convert stream to buffer
        const chunks = [];
        fileResponse.data.on('data', (chunk) => chunks.push(chunk));
        
        return new Promise((resolve, reject) => {
            fileResponse.data.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
            fileResponse.data.on('error', reject);
        });

    } catch (error) {
        console.error('Error finding/downloading ticket:', error);
        return null;
    }
}

/**
 * Poll for ticket generation completion and send to user
 * @param {string} phoneNumber - User's WhatsApp number
 * @param {Object} userData - User registration data
 * @param {number} maxAttempts - Maximum polling attempts
 */
async function pollForTicketAndSend(phoneNumber, userData, maxAttempts = 12) {
    let attempts = 0;
    const pollInterval = 10000; // 10 seconds

    const poll = async () => {
        attempts++;
        console.log(`Polling for ticket, attempt ${attempts}/${maxAttempts}`);

        try {
            const ticketBuffer = await findAndDownloadTicket(userData.email, userData.fullName);
            
            if (ticketBuffer) {
                // Ticket found! Send it to the user
                await uploadAndSendImage(
                    phoneNumber, 
                    ticketBuffer, 
                    `🎟️ Here's your Youth Big Sabbath ticket, ${userData.fullName}! See you there! 🙏`
                );

                // Update user state to completed
                const userState = getUserState(phoneNumber);
                userState.state = STATES.COMPLETED;
                setUserState(phoneNumber, userState);

                // Remove from ticket queue
                ticketQueue.del(phoneNumber);
                
                console.log(`Ticket sent successfully to ${phoneNumber}`);
                return true;
            } else if (attempts >= maxAttempts) {
                // Max attempts reached, send fallback message
                await sendMessage(
                    phoneNumber,
                    "⏰ Your ticket is being generated and will be sent to your email shortly. " +
                    "If you don't receive it within 10 minutes, please contact our support team."
                );
                
                // Update user state to completed
                const userState = getUserState(phoneNumber);
                userState.state = STATES.COMPLETED;
                setUserState(phoneNumber, userState);
                
                ticketQueue.del(phoneNumber);
                return false;
            } else {
                // Continue polling
                setTimeout(poll, pollInterval);
            }
        } catch (error) {
            console.error('Error during ticket polling:', error);
            if (attempts >= maxAttempts) {
                await sendMessage(
                    phoneNumber,
                    "❌ There was an issue generating your ticket. Please contact our support team with your reference: " + userData.ecocashReference
                );
                ticketQueue.del(phoneNumber);
            } else {
                setTimeout(poll, pollInterval);
            }
        }
    };

    // Start polling
    setTimeout(poll, 5000); // Wait 5 seconds before first attempt
}

/**
 * Get user state from cache
 */
function getUserState(phoneNumber) {
    return userStates.get(phoneNumber) || { state: STATES.INITIAL, data: {} };
}

/**
 * Set user state in cache
 */
function setUserState(phoneNumber, stateData) {
    userStates.set(phoneNumber, stateData);
}

/**
 * Process incoming message based on current user state
 */
async function processMessage(from, messageBody, message) {
    const userState = getUserState(from);
    const lowerMessage = messageBody.toLowerCase().trim();

    console.log(`Processing message from ${from}: "${messageBody}" (State: ${userState.state})`);

    switch (userState.state) {
        case STATES.INITIAL:
            await handleInitialMessage(from, lowerMessage);
            break;

        case STATES.PAYMENT_CHECK:
            await handlePaymentCheck(from, lowerMessage);
            break;

        case STATES.AWAITING_PAYMENT:
            await handlePaymentReturn(from, lowerMessage);
            break;

        case STATES.COLLECTING_NAME:
            await handleNameCollection(from, messageBody);
            break;

        case STATES.COLLECTING_PHONE:
            await handlePhoneCollection(from, messageBody);
            break;

        case STATES.COLLECTING_EMAIL:
            await handleEmailCollection(from, messageBody);
            break;

        case STATES.COLLECTING_CHURCH:
            await handleChurchCollection(from, messageBody);
            break;

        case STATES.COLLECTING_REFERENCE:
            await handleReferenceCollection(from, messageBody);
            break;

        case STATES.COLLECTING_SCREENSHOT:
            await handleScreenshotCollection(from, message);
            break;

        case STATES.GENERATING_TICKET:
            await sendMessage(from, "🎟️ Your ticket is being generated! Please wait a moment...");
            break;

        case STATES.COMPLETED:
            await sendMessage(from, "✅ Your registration is already completed! Your ticket has been sent. Thank you for registering for the Youth Big Sabbath.\n\nIf you need help, please contact our support team.");
            break;

        default:
            await handleInitialMessage(from, lowerMessage);
            break;
    }
}

// [Previous handler functions remain the same until handleScreenshotCollection]

/**
 * Handle initial greeting message
 */
async function handleInitialMessage(from, message) {
    if (message.includes('hi') || message.includes('hello') || message.includes('hey') || message.includes('start')) {
        const buttons = [
            {
                type: "reply",
                reply: {
                    id: "paid_yes",
                    title: "✅ Yes, I paid"
                }
            },
            {
                type: "reply",
                reply: {
                    id: "paid_no",
                    title: "❌ Not yet"
                }
            }
        ];

        await sendButtons(
            from,
            "👋 Hello! Let me help you register for the *Youth Big Sabbath*.\n\nHave you already paid the $2 EcoCash to *0773 220 297*?",
            buttons
        );

        setUserState(from, { state: STATES.PAYMENT_CHECK, data: {} });
    } else {
        await sendMessage(from, "👋 Hi! Say 'Hi' to start your registration for the Youth Big Sabbath.");
    }
}

/**
 * Handle payment verification
 */
async function handlePaymentCheck(from, message) {
    if (message.includes('yes') || message.includes('paid') || message === 'paid_yes') {
        await sendMessage(from, "Great! Let's proceed with your registration.\n\n📝 Please provide your *Full Name*:");
        setUserState(from, { state: STATES.COLLECTING_NAME, data: {} });
    } else if (message.includes('no') || message.includes('not') || message === 'paid_no') {
        await sendMessage(from, 
            "💰 Please make the $2 payment first using EcoCash.\n\n" +
            "📱 Dial this USSD code on your phone:\n" +
            "*151*2*2*0773220297*2#\n\n" +
            "After payment, reply with 'PAID' to continue with registration."
        );
        setUserState(from, { state: STATES.AWAITING_PAYMENT, data: {} });
    } else {
        await sendMessage(from, "Please reply with 'Yes' if you have paid or 'No' if you haven't paid yet.");
    }
}

/**
 * Handle user return after payment
 */
async function handlePaymentReturn(from, message) {
    if (message.includes('paid') || message.includes('done') || message.includes('completed')) {
        await sendMessage(from, "Perfect! Now let's complete your registration.\n\n📝 Please provide your *Full Name*:");
        setUserState(from, { state: STATES.COLLECTING_NAME, data: {} });
    } else {
        await sendMessage(from, 
            "💰 Please complete the $2 EcoCash payment first:\n" +
            "*151*2*2*0773220297*2#\n\n" +
            "Then reply with 'PAID' to continue."
        );
    }
}

/**
 * Collect full name
 */
async function handleNameCollection(from, message) {
    if (message.trim().length < 2) {
        await sendMessage(from, "Please provide a valid full name (at least 2 characters).");
        return;
    }

    const userState = getUserState(from);
    userState.data.fullName = message.trim();
    userState.state = STATES.COLLECTING_PHONE;
    setUserState(from, userState);

    await sendMessage(from, "📱 Thank you! Now please provide your *Phone Number*:");
}

/**
 * Collect phone number
 */
async function handlePhoneCollection(from, message) {
    const phoneRegex = /^(\+?263|0)?[0-9]{9,10}$/;
    if (!phoneRegex.test(message.replace(/\s/g, ''))) {
        await sendMessage(from, "Please provide a valid phone number (e.g., 0771234567 or +263771234567).");
        return;
    }

    const userState = getUserState(from);
    userState.data.phoneNumber = message.trim();
    userState.state = STATES.COLLECTING_EMAIL;
    setUserState(from, userState);

    await sendMessage(from, "📧 Great! Now please provide your *Email Address*:");
}

/**
 * Collect email address
 */
async function handleEmailCollection(from, message) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(message.trim())) {
        await sendMessage(from, "Please provide a valid email address (e.g., example@gmail.com).");
        return;
    }

    const userState = getUserState(from);
    userState.data.email = message.trim();
    userState.state = STATES.COLLECTING_CHURCH;
    setUserState(from, userState);

    await sendMessage(from, "⛪ Perfect! Now please provide your *Church Name*:");
}

/**
 * Collect church name
 */
async function handleChurchCollection(from, message) {
    if (message.trim().length < 2) {
        await sendMessage(from, "Please provide a valid church name.");
        return;
    }

    const userState = getUserState(from);
    userState.data.churchName = message.trim();
    userState.state = STATES.COLLECTING_REFERENCE;
    setUserState(from, userState);

    await sendMessage(from, "💳 Excellent! Now please provide your *EcoCash Reference Number*:");
}

/**
 * Collect EcoCash reference number
 */
async function handleReferenceCollection(from, message) {
    if (message.trim().length < 5) {
        await sendMessage(from, "Please provide a valid EcoCash reference number (at least 5 characters).");
        return;
    }

    const userState = getUserState(from);
    userState.data.ecocashReference = message.trim();
    userState.data.whatsappNumber = from;
    userState.state = STATES.COLLECTING_SCREENSHOT;
    setUserState(from, userState);

    await sendMessage(from, 
        "📸 Almost done! Please send a *screenshot* of your payment confirmation.\n\n" +
        "You can also skip this step by typing 'SKIP' and we'll verify your payment using the reference number."
    );
}

/**
 * Handle screenshot or skip option and complete registration
 */
async function handleScreenshotCollection(from, message) {
    const userState = getUserState(from);
    
    if (message && typeof message === 'object' && message.image) {
        userState.data.paymentScreenshot = 'Image received';
    } else if (typeof message === 'string' && message.toLowerCase().includes('skip')) {
        userState.data.paymentScreenshot = 'Skipped - will verify via reference';
    } else {
        await sendMessage(from, "Please send a screenshot of your payment or type 'SKIP' to proceed without it.");
        return;
    }

    // Update state to generating ticket
    userState.state = STATES.GENERATING_TICKET;
    setUserState(from, userState);

    await sendMessage(from, 
        "🎉 *Registration Completed!*\n\n" +
        "✅ Your details have been recorded for the Youth Big Sabbath.\n\n" +
        "🎟️ *Generating your ticket now...* Please wait a moment!\n\n" +
        "*Registration Summary:*\n" +
        `👤 Name: ${userState.data.fullName}\n` +
        `📱 Phone: ${userState.data.phoneNumber}\n` +
        `📧 Email: ${userState.data.email}\n` +
        `⛪ Church: ${userState.data.churchName}\n` +
        `💳 Reference: ${userState.data.ecocashReference}`
    );

    // Send to Apps Script (which handles Google Sheets and ticket generation)
    const saveResult = await sendToAppsScript(userState.data);
    
    if (saveResult.success) {
        console.log('Registration sent to Apps Script successfully');
        
        // Add to ticket queue for polling (as backup)
        ticketQueue.set(from, {
            userData: userState.data,
            timestamp: Date.now()
        });

        // Start polling for the generated ticket (backup method)
        pollForTicketAndSend(from, userState.data);

    } else {
        await sendMessage(from, 
            "⚠️ Registration completed but there was an issue processing your request. " +
            "Please contact our support team with your reference number: " + userState.data.ecocashReference
        );
        
        userState.state = STATES.COMPLETED;
        setUserState(from, userState);
    }
}

/**
 * Webhook endpoint for Apps Script to notify when ticket is ready
 */
app.post('/ticket-ready', async (req, res) => {
    try {
        const { whatsappNumber, ticketUrl, userData } = req.body;
        
        console.log('Ticket ready notification:', { whatsappNumber, ticketUrl });
        
        if (ticketUrl) {
            // Send the ticket image directly using the URL
            await sendImage(
                whatsappNumber, 
                ticketUrl, 
                `🎟️ Here's your Youth Big Sabbath ticket, ${userData?.fullName || 'there'}! See you there! 🙏`
            );
            
            // Update user state
            const userState = getUserState(whatsappNumber);
            userState.state = STATES.COMPLETED;
            setUserState(whatsappNumber, userState);
            
            // Remove from ticket queue
            ticketQueue.del(whatsappNumber);
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error handling ticket ready notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /webhook - Meta's webhook verification endpoint
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook verified successfully!');
            res.status(200).send(challenge);
        } else {
            console.log('Webhook verification failed - invalid token');
            res.sendStatus(403);
        }
    } else {
        console.log('Webhook verification failed - missing parameters');
        res.sendStatus(400);
    }
});

/**
 * POST /webhook - Handle incoming WhatsApp messages
 */
app.post('/webhook', async (req, res) => {
    console.log('Incoming webhook:', JSON.stringify(req.body, null, 2));

    try {
        const body = req.body;

        if (body.object) {
            if (body.entry && 
                body.entry[0].changes && 
                body.entry[0].changes[0] && 
                body.entry[0].changes[0].value.messages && 
                body.entry[0].changes[0].value.messages[0]
            ) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                
                let messageBody = '';
                if (message.text?.body) {
                    messageBody = message.text.body;
                } else if (message.interactive?.button_reply?.title) {
                    messageBody = message.interactive.button_reply.id;
                } else if (message.image) {
                    messageBody = 'image_received';
                }

                console.log(`Message from ${from}: ${messageBody}`);

                await processMessage(from, messageBody, message);
            }

            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Youth Big Sabbath Registration Bot with Ticket Generation is running!',
        timestamp: new Date().toISOString(),
        activeRegistrations: userStates.keys().length,
        pendingTickets: ticketQueue.keys().length
    });
});

// Start the server
app.listen(port, () => {
    console.log(`🚀 Youth Big Sabbath Registration Bot is running on port ${port}`);
    console.log(`📱 Webhook URL: http://localhost:${port}/webhook`);
    console.log(`🎟️ Ticket notification URL: http://localhost:${port}/ticket-ready`);
    console.log(`🔧 Environment check:`);
    console.log(`   - WHATSAPP_TOKEN: ${WHATSAPP_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - PHONE_NUMBER_ID: ${PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - VERIFY_TOKEN: ${VERIFY_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - GOOGLE_SHEETS_ID: ${GOOGLE_SHEETS_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - GOOGLE_SERVICE_ACCOUNT: ${GOOGLE_SERVICE_ACCOUNT_EMAIL ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - APPS_SCRIPT_URL: ${APPS_SCRIPT_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(`   - GOOGLE_DRIVE_FOLDER_ID: ${GOOGLE_DRIVE_FOLDER_ID ? '✅ Set' : '❌ Missing'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Youth Big Sabbath Registration Bot...');
    process.exit(0);
});