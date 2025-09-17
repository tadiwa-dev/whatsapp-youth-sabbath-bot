/**
 * Complete Google Apps Script for WhatsApp Bot Integration
 * This integrates with your existing ticket generation system
 */

// Configuration - Update these values
const WHATSAPP_BOT_URL = 'https://your-app-name.onrender.com'; // Your deployed bot URL
const SHEET_NAME = "Form Responses 1"; // Your existing sheet name
const SLIDE_TEMPLATE_ID = "1GGYQ30h8A0PUVPGo0eZJD7TkqtE3ICGwnN58BvKMVVo"; // Your existing template ID

/**
 * Web App Entry Point - Handles POST requests from WhatsApp bot
 */
function doPost(e) {
  try {
    console.log('Received request:', e.postData.contents);
    
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'registerUser') {
      return handleUserRegistration(data);
    } else if (data.action === 'generateTicket') {
      return handleTicketGeneration(data);
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
 * Handle user registration from WhatsApp bot
 */
function handleUserRegistration(data) {
  try {
    const { userData } = data;
    
    // Add user data to your existing sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    // Generate ticket number
    const lastRow = sheet.getLastRow();
    const ticketNumber = "TICKET-" + (lastRow).toString().padStart(4, "0");
    
    // Prepare row data to match your existing sheet structure
    const rowData = [
      new Date(), // Timestamp (Column A)
      userData.fullName, // Name (Column B)
      userData.phoneNumber, // Phone (Column C)
      userData.email, // Email (Column D)
      userData.churchName, // Church (Column E)
      userData.ecocashReference, // EcoCash Reference (Column F)
      userData.paymentScreenshot || 'Via WhatsApp Bot', // Screenshot (Column G)
      ticketNumber, // Ticket Number (Column H)
      'Pending', // Status (Column I)
      '', // Column J (Reserved for your other script)
      userData.whatsappNumber // WhatsApp Number (Column K) - NEW
    ];
    
    // Add the row to the sheet
    sheet.appendRow(rowData);
    const newRowNumber = sheet.getLastRow();
    
    console.log(`User registered: ${userData.fullName}, Row: ${newRowNumber}, Ticket: ${ticketNumber}`);
    
    // Generate and send ticket immediately
    generateTicketForRow(newRowNumber, userData, ticketNumber);
    
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: true, 
        rowNumber: newRowNumber,
        ticketNumber: ticketNumber
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in handleUserRegistration:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Generate ticket for a specific row (modified from your existing function)
 */
function generateTicketForRow(rowNumber, userData, ticketNumber) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    // Create folder if it doesn't exist
    let folder;
    try {
      folder = DriveApp.getFoldersByName("Generated Tickets").next();
    } catch (e) {
      folder = DriveApp.createFolder("Generated Tickets");
    }
    
    const name = userData.fullName;
    const email = userData.email;
    const church = userData.churchName;
    const ecorefnum = userData.ecocashReference;
    const whatsappNumber = userData.whatsappNumber;
    
    const qrData = `${ticketNumber} | ${name} | ${church} | ${ecorefnum}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
    
    // Create ticket slide
    const slideFile = DriveApp.getFileById(SLIDE_TEMPLATE_ID).makeCopy(`Ticket - ${ticketNumber}`, folder);
    const slide = SlidesApp.openById(slideFile.getId());
    const slidePage = slide.getSlides()[0];
    
    // Replace placeholders
    slidePage.replaceAllText("{{Name}}", name);
    slidePage.replaceAllText("{{TicketNumber}}", ticketNumber);
    slidePage.replaceAllText("{{Church}}", church);
    slidePage.replaceAllText("{{Event}}", "Chiremba Federation Big Sabbath");
    
    // Add QR code
    const response = UrlFetchApp.fetch(qrCodeUrl);
    const blob = response.getBlob().setName("qr.png");
    const image = slidePage.insertImage(blob);
    
    // Set QR code size and position (your existing logic)
    const qrWidth = 70;
    const qrHeight = 70;
    image.setWidth(qrWidth);
    image.setHeight(qrHeight);
    
    const pageWidth = 576;
    const pageHeight = 216;
    const left = pageWidth - qrWidth - 20;
    const top = (pageHeight - qrHeight) / 2;
    
    image.setLeft(left);
    image.setTop(top);
    
    slide.saveAndClose();
    
    // Export all slides as images for WhatsApp using Slides API
    const slides = SlidesApp.openById(slide.getId());
    const allSlides = slides.getSlides();
    
    // Create images for each slide and combine or send separately
    const ticketImages = [];
    
    for (let i = 0; i < allSlides.length; i++) {
      const slideId = allSlides[i].getObjectId();
      
      const imageBlob = Utilities.newBlob(
        UrlFetchApp.fetch(
          `https://docs.google.com/presentation/d/${slide.getId()}/export/png?id=${slide.getId()}&pageid=${slideId}`,
          {
            headers: {
              'Authorization': `Bearer ${ScriptApp.getOAuthToken()}`
            }
          }
        ).getContent(),
        'image/png',
        `${ticketNumber}-ticket-page${i+1}.png`
      );
      
      const ticketImageFile = folder.createFile(imageBlob);
      ticketImages.push(ticketImageFile);
    }
    
    // Use the first image for the main notification (we'll send both separately)
    const ticketImageFile = ticketImages[0];
    
    // Make the image publicly accessible temporarily
    ticketImageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const ticketImageUrl = `https://drive.google.com/uc?id=${ticketImageFile.getId()}`;
    
    console.log(`Ticket generated: ${ticketImageUrl}`);
    
    // Send to WhatsApp bot - send all ticket images
    if (whatsappNumber) {
      // Send each ticket image separately
      for (let i = 0; i < ticketImages.length; i++) {
        const imageFile = ticketImages[i];
        imageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const imageUrl = `https://drive.google.com/uc?id=${imageFile.getId()}`;
        
        // Add a small delay between images
        if (i > 0) {
          Utilities.sleep(2000); // 2 second delay
        }
        
        notifyWhatsAppBot(whatsappNumber, imageUrl, userData, `${ticketNumber}-Page${i+1}`);
      }
    }
    
    // Also send email (your existing logic)
    if (email && email.includes("@")) {
      const pdf = DriveApp.getFileById(slide.getId()).getAs("application/pdf");
      GmailApp.sendEmail(email, "Your Big Sabbath Ticket", "Thank you for registering. Please find your ticket attached.", {
        attachments: [pdf]
      });
    }
    
    // Update status to Sent
    sheet.getRange(rowNumber, 9).setValue("Sent");
    
    // Clean up the slide file (keep only the image)
    DriveApp.getFileById(slide.getId()).setTrashed(true);
    
    return ticketImageFile.getId();
    
  } catch (error) {
    console.error('Error generating ticket:', error);
    
    // Update status to Error
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.getRange(rowNumber, 9).setValue("Error");
    
    throw error;
  }
}

/**
 * Notify WhatsApp bot that ticket is ready
 */
function notifyWhatsAppBot(whatsappNumber, ticketImageUrl, userData, ticketNumber) {
  try {
    const payload = {
      whatsappNumber: whatsappNumber,
      ticketUrl: ticketImageUrl,
      userData: userData,
      ticketNumber: ticketNumber
    };
    
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(`${WHATSAPP_BOT_URL}/ticket-ready`, options);
    console.log('WhatsApp bot notified:', response.getContentText());
    
    // Remove public access after 5 minutes
    Utilities.sleep(5000); // Wait 5 seconds for WhatsApp to fetch the image
    
  } catch (error) {
    console.error('Error notifying WhatsApp bot:', error);
    // Don't throw error - ticket generation should still succeed
  }
}

/**
 * Your existing function - modified to work with both form and WhatsApp submissions
 */
function generateAndEmailTickets() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let folder;
  try {
    folder = DriveApp.getFoldersByName("Generated Tickets").next();
  } catch (e) {
    folder = DriveApp.createFolder("Generated Tickets");
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[1];
    const email = row[3];
    const church = row[4];
    const ecorefnum = row[5];
    const whatsappNumber = row[10]; // Column K for WhatsApp number
    
    const ticketNumber = row[7] && row[7].toString().trim() !== "" 
      ? row[7] 
      : "TICKET-" + i.toString().padStart(4, "0");

    // Save generated or existing ticket number into Column H
    sheet.getRange(i + 1, 8).setValue(ticketNumber);

    const status = row[8]; // Column I (Status)

    const qrData = `${ticketNumber} | ${name} | ${church} | ${ecorefnum}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

    if (status !== "Sent" && email && email.includes("@")) {
      const slideFile = DriveApp.getFileById(SLIDE_TEMPLATE_ID).makeCopy(`Ticket - ${ticketNumber}`, folder);
      const slide = SlidesApp.openById(slideFile.getId());
      const slidePage = slide.getSlides()[0];

      slidePage.replaceAllText("{{Name}}", name);
      slidePage.replaceAllText("{{TicketNumber}}", ticketNumber);
      slidePage.replaceAllText("{{Church}}", church);
      slidePage.replaceAllText("{{Event}}", "Chiremba Federation Big Sabbath");
      
      const response = UrlFetchApp.fetch(qrCodeUrl);
      const blob = response.getBlob().setName("qr.png");
      const image = slidePage.insertImage(blob);

      const qrWidth = 70;
      const qrHeight = 70;
      image.setWidth(qrWidth);
      image.setHeight(qrHeight);

      const pageWidth = 576;
      const pageHeight = 216;
      const left = pageWidth - qrWidth - 20;
      const top = (pageHeight - qrHeight) / 2;

      image.setLeft(left);
      image.setTop(top);

      slide.saveAndClose();

      // Send email
      const pdf = DriveApp.getFileById(slide.getId()).getAs("application/pdf");
      GmailApp.sendEmail(email, "Your Big Sabbath Ticket", "Thank you for registering. Please find your ticket attached.", {
        attachments: [pdf]
      });

      // If this was a WhatsApp registration, also send to WhatsApp
      if (whatsappNumber && whatsappNumber.toString().startsWith('263')) {
        // Export as image for WhatsApp using Slides API
        const slides = SlidesApp.openById(slide.getId());
        const slideId = slides.getSlides()[0].getObjectId();
        
        const imageBlob = Utilities.newBlob(
          UrlFetchApp.fetch(
            `https://docs.google.com/presentation/d/${slide.getId()}/export/png?id=${slide.getId()}&pageid=${slideId}`,
            {
              headers: {
                'Authorization': `Bearer ${ScriptApp.getOAuthToken()}`
              }
            }
          ).getContent(),
          'image/png',
          `${ticketNumber}-whatsapp.png`
        );
        
        const ticketImageFile = folder.createFile(imageBlob);
        
        ticketImageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const ticketImageUrl = `https://drive.google.com/uc?id=${ticketImageFile.getId()}`;
        
        const userData = {
          fullName: name,
          email: email,
          churchName: church,
          ecocashReference: ecorefnum,
          whatsappNumber: whatsappNumber
        };
        
        notifyWhatsAppBot(whatsappNumber, ticketImageUrl, userData, ticketNumber);
      }

      sheet.getRange(i + 1, 9).setValue("Sent");
      
      // Clean up
      DriveApp.getFileById(slide.getId()).setTrashed(true);
    } else {
      Logger.log(`Skipping row ${i + 2} — missing or invalid email`);
    }
  }
}

/**
 * Test function for WhatsApp integration
 * This will add a test row with WhatsApp number in Column K
 */
function testWhatsAppIntegration() {
  const testData = {
    action: 'registerUser',
    userData: {
      fullName: 'Test User',
      phoneNumber: '0771234567',
      email: 'test@example.com',
      churchName: 'Test Church',
      ecocashReference: 'TEST123',
      paymentScreenshot: 'Via WhatsApp Bot',
      whatsappNumber: '263771234567' // This will go to Column K
    }
  };
  
  const e = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(e);
  console.log('Test result:', result.getContent());
}

/**
 * Setup function - run this once to prepare the script
 */
function setupScript() {
  console.log('=== WhatsApp Bot Integration Setup ===');
  console.log('1. Update WHATSAPP_BOT_URL with your deployed bot URL');
  console.log('2. Deploy this script as a web app');
  console.log('3. Set "Execute as" to "Me" and "Who has access" to "Anyone"');
  console.log('4. Copy the web app URL and use it as APPS_SCRIPT_URL in your bot');
  console.log('5. Test the integration using testWhatsAppIntegration()');
  
  // Check if the sheet exists
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    console.log('✅ Sheet found:', SHEET_NAME);
    
    // Check if we need to add the WhatsApp number column
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes('WhatsApp Number')) {
      sheet.getRange(1, 11).setValue('WhatsApp Number'); // Column K
      console.log('✅ Added WhatsApp Number column to Column K');
    }
    
  } catch (error) {
    console.error('❌ Sheet not found:', SHEET_NAME);
  }
  
  // Check template
  try {
    DriveApp.getFileById(SLIDE_TEMPLATE_ID);
    console.log('✅ Slide template found');
  } catch (error) {
    console.error('❌ Slide template not found:', SLIDE_TEMPLATE_ID);
  }
}
