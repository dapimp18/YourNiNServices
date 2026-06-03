const { google } = require('googleapis');
const { Readable } = require('stream');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fileName, mimeType, base64Data } = JSON.parse(event.body);

    if (!fileName || !mimeType || !base64Data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Missing required fields' }),
      };
    }

    // Authenticate with Google using service account credentials
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Convert base64 to a readable stream
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    // Build a timestamped filename to avoid clashes
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = `${timestamp}_${fileName}`;

    // Upload the file to the specified Drive folder
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    // Make the file viewable by anyone with the link
    await drive.permissions.create({
      fileId: uploadResponse.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        driveUrl: uploadResponse.data.webViewLink,
        fileId: uploadResponse.data.id,
      }),
    };
  } catch (error) {
    console.error('Drive upload error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
