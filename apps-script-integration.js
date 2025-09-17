/**
 * Google Apps Script Integration Code
 * Add this to your existing Google Apps Script that generates tickets
 */

// Your WhatsApp bot URL (replace with your actual deployed URL)
const WHATSAPP_BOT_URL = 'https://your-app-name.onrender.com';

/**
 * Modified function to handle WhatsApp bot integration
 * Call this function after your existing ticket generation logic
 */
function notifyWhatsAppBot(whatsappNumber, ticketFileId, userData) {
  try {
    // Get the file from Drive and make it publicly accessible (temporarily)
    const file = DriveApp.getFileById(ticketFileId);
    
    // Create a publicly accessible link (you might want to use a more secure method)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const ticketUrl = `https://drive.google.com/uc?id=${ticketFileId}`;
    
    // Notify the WhatsApp bot that the ticket is ready
    const payload = {
      whatsappNumber: whatsappNumber,
      ticketUrl: ticketUrl,
      userData: userData
    };
    
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(`${WHATSAPP_BOT_URL}/ticket-ready`, options);
    
    console.log('WhatsApp bot notified:', response.getContentText());
    
    // Optional: Remove public access after a delay
    Utilities.sleep(30000); // Wait 30 seconds
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    
  } catch (error) {
    console.error('Error notifying WhatsApp bot:', error);
  }
}

/**
 * Web app handler to receive requests from the WhatsApp bot
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'generateTicket') {
      // Your existing ticket generation logic here
      // This is where you would call your existing functions
      
      const { rowNumber, userData, whatsappNumber } = data;
      
      // Example: Generate ticket using your existing logic
      const ticketFileId = generateTicketForRow(rowNumber, userData);
      
      if (ticketFileId) {
        // Notify the WhatsApp bot that the ticket is ready
        notifyWhatsAppBot(whatsappNumber, ticketFileId, userData);
        
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, ticketFileId: ticketFileId }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Failed to generate ticket' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in doPost:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Example function - replace with your actual ticket generation logic
 */
function generateTicketForRow(rowNumber, userData) {
  try {
    // Your existing ticket generation logic here
    // This should return the file ID of the generated ticket
    
    // Example implementation:
    // 1. Open your Google Slides template
    // 2. Replace placeholders with user data
    // 3. Export as image
    // 4. Save to Drive
    // 5. Return the file ID
    
    console.log(`Generating ticket for row ${rowNumber}:`, userData);
    
    // Placeholder - replace with your actual logic
    // const templateId = 'your-google-slides-template-id';
    // const template = SlidesApp.openById(templateId);
    // ... your existing code ...
    
    // Return the file ID of the generated ticket
    return 'generated-ticket-file-id';
    
  } catch (error) {
    console.error('Error generating ticket:', error);
    return null;
  }
}

/**
 * Alternative approach: Modify your existing form submission trigger
 * Add this to your existing onFormSubmit function
 */
function onFormSubmitWithWhatsApp(e) {
  // Your existing form submission logic
  
  // Get the submitted data
  const values = e.values;
  const whatsappNumber = values[7]; // Adjust index based on your form structure
  
  if (whatsappNumber && whatsappNumber.startsWith('263')) {
    // This submission came from WhatsApp bot
    const userData = {
      fullName: values[1],
      phoneNumber: values[2],
      email: values[3],
      churchName: values[4],
      ecocashReference: values[5]
    };
    
    // Generate ticket using your existing logic
    const ticketFileId = generateTicketForUser(userData);
    
    if (ticketFileId) {
      // Notify WhatsApp bot
      notifyWhatsAppBot(whatsappNumber, ticketFileId, userData);
    }
  }
  
  // Continue with your existing email sending logic for regular form submissions
}

/**
 * Setup function - run this once to deploy as web app
 */
function setupWebApp() {
  console.log('To deploy this as a web app:');
  console.log('1. Click "Deploy" > "New Deployment"');
  console.log('2. Choose "Web app" as the type');
  console.log('3. Set "Execute as" to "Me"');
  console.log('4. Set "Who has access" to "Anyone"');
  console.log('5. Copy the web app URL and use it as APPS_SCRIPT_URL in your WhatsApp bot');
}

/**
 * Test function to verify the integration
 */
function testWhatsAppIntegration() {
  const testData = {
    action: 'generateTicket',
    rowNumber: 1,
    userData: {
      fullName: 'Test User',
      email: 'test@example.com',
      phoneNumber: '0771234567',
      churchName: 'Test Church',
      ecocashReference: 'TEST123'
    },
    whatsappNumber: '263771234567'
  };
  
  const e = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(e);
  console.log('Test result:', result.getContent());
}

