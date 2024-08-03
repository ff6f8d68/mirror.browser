const shell = require('shelljs');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

// Function to save HTML content and assets locally
async function saveContent(baseDir, fileName, content) {
  const filePath = path.join(baseDir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function createZip(baseDir, outputFilePath) {
  const zip = new AdmZip();
  zip.addLocalFolder(baseDir);
  zip.writeZip(outputFilePath);
}

exports.handler = async (event, context) => {
  try {
    const url = event.queryStringParameters?.url;
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing url parameter' }),
      };
    }

    const websiteUrl = decodeURIComponent(url);
    const websiteName = new URL(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    const baseDir = path.join(__dirname, 'core', 'mirror', websiteName);
    const outputFilePath = path.join(__dirname, 'core', 'mirror', `${websiteName}.zip`);

    // Run wget to download the website
    const wgetCommand = `wget --mirror --convert-links --adjust-extension --page-requisites --no-parent --directory-prefix=${baseDir} ${websiteUrl}`;
    const wgetResult = shell.exec(wgetCommand, { silent: false });

    if (wgetResult.code !== 0) {
      throw new Error(`wget failed with code ${wgetResult.code}. Output: ${wgetResult.stderr}`);
    }

    // Create a ZIP file from the downloaded site
    await createZip(baseDir, outputFilePath);

    const zipContent = fs.readFileSync(outputFilePath);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${websiteName}.zip`
      },
      body: zipContent.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
