# Youth Big Sabbath Registration Bot

A WhatsApp chatbot for automating Youth Big Sabbath event registration using the WhatsApp Cloud API and Google Sheets integration.

## 🎯 Features

- **Automated Registration Flow**: Guides users through complete registration process
- **Payment Verification**: Checks if users have paid the $2 EcoCash fee
- **Data Collection**: Collects all required registration information
- **Google Sheets Integration**: Automatically saves registration data to Google Sheets
- **State Management**: Maintains conversation context for each user
- **Interactive Buttons**: Uses WhatsApp interactive buttons for better UX
- **Input Validation**: Validates email, phone numbers, and other inputs

## 🔄 Registration Flow

1. **Greeting**: User says "Hi" to start registration
2. **Payment Check**: Bot asks if user has paid $2 EcoCash to 0773 220 297
   - If **No**: Provides USSD code `*151*2*2*0773220297*2#`
   - If **Yes**: Proceeds to data collection
3. **Data Collection**: Bot collects:
   - Full Name
   - Phone Number
   - Email Address
   - Church Name
   - EcoCash Reference Number
   - Screenshot of Payment Proof (optional)
4. **Completion**: Data is saved to Google Sheets and confirmation is sent

## 📋 Prerequisites

1. **Node.js** (v14 or higher)
2. **WhatsApp Business API** access through Meta Developer Console
3. **Google Cloud Project** with Sheets API enabled
4. **Google Service Account** with Sheets access
5. **Hosting platform** (Render recommended)

## 🛠️ Local Development Setup

### 1. Clone and Install

```bash
# Navigate to project directory
cd whatsapp-chatbot

# Install dependencies
npm install
```

### 2. WhatsApp API Setup

1. **Meta Developer Console**
   - Visit [developers.facebook.com](https://developers.facebook.com)
   - Create/select your app
   - Add WhatsApp Business API

2. **Get Credentials**
   - **Access Token**: From WhatsApp > API Setup
   - **Phone Number ID**: From WhatsApp > API Setup  
   - **Verify Token**: Create a custom string

### 3. Google Sheets Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create new project or select existing one

2. **Enable Google Sheets API**
   - Navigate to APIs & Services > Library
   - Search for "Google Sheets API"
   - Enable the API

3. **Create Service Account**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "Service Account"
   - Fill in service account details
   - Download the JSON key file

4. **Create Google Sheet**
   - Create a new Google Sheet
   - Add headers in row 1: `Timestamp | Full Name | Phone Number | Email | Church Name | EcoCash Reference | Payment Screenshot | WhatsApp Number`
   - Share the sheet with your service account email (give Editor access)
   - Copy the Sheet ID from the URL

### 4. Environment Configuration

```bash
# Copy the example environment file
cp env.example .env
```

Fill in your `.env` file:

```env
# WhatsApp Configuration
WHATSAPP_TOKEN=your_whatsapp_access_token
PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=your_custom_verify_token

# Google Sheets Configuration
GOOGLE_SHEETS_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour actual private key from JSON file\n-----END PRIVATE KEY-----"

# Server Configuration
PORT=3000
```

### 5. Run Locally

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

## 🌐 Deployment on Render

### 1. Prepare Repository

```bash
git init
git add .
git commit -m "Youth Big Sabbath registration bot"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Deploy on Render

1. **Create Account**: Sign up at [render.com](https://render.com)
2. **New Web Service**: 
   - Connect GitHub repository
   - Configure:
     - **Name**: `youth-sabbath-bot`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`

3. **Environment Variables**: Add in Render dashboard:
   ```
   WHATSAPP_TOKEN=your_token
   PHONE_NUMBER_ID=your_phone_id
   VERIFY_TOKEN=your_verify_token
   GOOGLE_SHEETS_ID=your_sheet_id
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
   GOOGLE_PRIVATE_KEY=your_private_key_with_newlines
   ```

### 3. Integrate with Your Existing Apps Script

1. **Open Your Google Apps Script**:
   - Go to [script.google.com](https://script.google.com)
   - Open your existing ticket generation script

2. **Add Integration Code**:
   - Copy the code from `apps-script-integration.js` 
   - Paste it into your existing script
   - Modify your existing functions to call `notifyWhatsAppBot()`

3. **Deploy as Web App**:
   - Click "Deploy" > "New Deployment"
   - Choose "Web app" as the type
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Click "Deploy" and copy the web app URL

4. **Update Environment Variables**:
   - Add the web app URL as `APPS_SCRIPT_URL` in Render
   - Add your Google Drive folder ID as `GOOGLE_DRIVE_FOLDER_ID`

### 4. Configure WhatsApp Webhook

1. **Meta Developer Console**:
   - Go to WhatsApp > Configuration
   - Webhook URL: `https://your-app-name.onrender.com/webhook`
   - Verify Token: Same as your `VERIFY_TOKEN`
   - Subscribe to: `messages`

## 📱 Testing the Bot

### Test Scenarios

1. **Start Registration**:
   - Send: "Hi"
   - Expected: Payment check question with buttons

2. **Payment Not Made**:
   - Choose "Not yet" or send "No"
   - Expected: USSD code provided

3. **Payment Made**:
   - Choose "Yes, I paid" or send "Yes"
   - Expected: Name collection starts

4. **Complete Registration**:
   - Follow the prompts to provide all information
   - Expected: Confirmation message and data saved to Google Sheets

### Sample Conversation

```
User: Hi
Bot: 👋 Hello! Let me help you register for the Youth Big Sabbath.
     Have you already paid the $2 EcoCash to 0773 220 297?
     [✅ Yes, I paid] [❌ Not yet]

User: [Clicks "Not yet"]
Bot: 💰 Please make the $2 payment first using EcoCash.
     📱 Dial this USSD code on your phone:
     *151*2*2*0773220297*2#
     After payment, reply with 'PAID' to continue.

User: PAID
Bot: Perfect! Now let's complete your registration.
     📝 Please provide your Full Name:

User: John Doe
Bot: 📱 Thank you! Now please provide your Phone Number:

[... continues through all fields ...]

Bot: 🎉 Registration Completed Successfully!
     Your details have been recorded for the Youth Big Sabbath.
     [Shows summary of provided information]
```

## 🔧 Project Structure

```
whatsapp-chatbot/
├── package.json          # Dependencies and scripts
├── index.js             # Main application with registration flow
├── env.example          # Environment variables template
├── README.md            # This documentation
└── .env                 # Your environment variables (create this)
```

## 📊 Google Sheets Integration

The bot integrates with your **existing Google Sheet and Apps Script** system:

### Data Structure
The bot saves data to your existing Google Sheet with these columns:

| Column | Description |
|--------|-------------|
| A - Timestamp | Registration completion time |
| B - Full Name | User's full name |
| C - Phone Number | User's phone number |
| D - Email | User's email address |
| E - Church Name | User's church |
| F - EcoCash Reference | Payment reference number |
| G - Payment Screenshot | Screenshot status |
| H - Ticket Number | Generated ticket number |
| I - Status | Ticket generation status |
| J - (Reserved) | Used by your other script for scanning |
| K - WhatsApp Number | User's WhatsApp number (NEW) |

### Apps Script Integration

1. **Add Integration Code**: Copy the code from `apps-script-integration.js` to your existing Google Apps Script

2. **Deploy as Web App**:
   - In Apps Script editor: Deploy → New Deployment
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone
   - Copy the web app URL for your environment variables

3. **Modify Your Existing Script**:
   ```javascript
   // Add this to your existing ticket generation function
   function yourExistingTicketFunction(userData) {
     // Your existing logic...
     const ticketFileId = generateTicket(userData);
     
     // NEW: Notify WhatsApp bot if this came from WhatsApp
     if (userData.whatsappNumber) {
       notifyWhatsAppBot(userData.whatsappNumber, ticketFileId, userData);
     }
     
     // Your existing email sending logic...
   }
   ```

### Ticket Delivery Flow

1. **User completes registration** via WhatsApp bot
2. **Data is saved** to your existing Google Sheet  
3. **Apps Script is triggered** to generate ticket using your existing logic
4. **Ticket image is generated** using your Google Slides template
5. **WhatsApp bot is notified** with the ticket image URL
6. **Ticket is sent** directly to user's WhatsApp

### Alternative Methods

The system supports multiple ways to deliver tickets:

1. **Direct notification** from Apps Script (recommended)
2. **Polling method** - bot checks Google Drive for new tickets
3. **Webhook integration** - Apps Script calls bot when ticket is ready

## 🚨 Troubleshooting

### Common Issues

1. **Webhook Verification Failed**
   - Check `VERIFY_TOKEN` matches in both .env and Meta console
   - Ensure webhook URL is accessible and correct

2. **Messages Not Sending**
   - Verify `WHATSAPP_TOKEN` is valid and not expired
   - Check `PHONE_NUMBER_ID` is correct
   - Ensure phone number is verified in Meta console

3. **Google Sheets Not Working**
   - Verify service account has access to the sheet
   - Check `GOOGLE_SHEETS_ID` is correct
   - Ensure private key format is correct (with \n for newlines)

4. **User State Issues**
   - States are stored in memory (resets on server restart)
   - For production, consider using Redis or database

### Debug Mode

Add detailed logging by modifying console.log statements in the code or set up a proper logging system.

## 🔒 Security Considerations

- Never commit `.env` file to version control
- Rotate WhatsApp tokens regularly
- Limit Google Sheets access to necessary permissions only
- Implement rate limiting for production use
- Validate and sanitize all user inputs

## 📈 Scaling Considerations

For high-volume usage:

1. **Database**: Replace NodeCache with Redis or PostgreSQL
2. **Queue System**: Use Bull Queue for message processing
3. **Load Balancing**: Deploy multiple instances behind a load balancer
4. **Monitoring**: Add application monitoring and alerting
5. **Backup**: Regular backup of registration data

## 🎛️ Customization

### Modify Registration Fields

Edit the `STATES` object and corresponding handler functions in `index.js` to add/remove fields.

### Change Payment Amount

Update the payment amount in the message texts throughout the code.

### Customize Messages

Modify the text messages in each handler function to match your event branding.

## 📞 Support

For technical issues:
1. Check the troubleshooting section
2. Review server logs
3. Verify all environment variables
4. Test webhook connectivity

## 📄 License

MIT License - see package.json for details.

---

**Built with ❤️ for Youth Big Sabbath Registration**

🚀 Ready to register participants efficiently!