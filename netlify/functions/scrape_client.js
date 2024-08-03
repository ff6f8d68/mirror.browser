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

async function saveAssets(driver, websiteUrl, baseDir) {
  const assets = new Set();
  
  const assetUrls = await driver.findElements(By.css('img[src], link[href], script[src]'));
  for (const asset of assetUrls) {
    const url = await asset.getAttribute('src') || await asset.getAttribute('href');
    if (url && url.startsWith('http')) {
      assets.add(new URL(url, websiteUrl).href);
    }
  }

  await Promise.all(Array.from(assets).map(async (assetUrl) => {
    try {
      const assetResponse = await axios.get(assetUrl, { responseType: 'arraybuffer' });
      const assetName = path.basename(new URL(assetUrl).pathname);
      await saveContent(baseDir, assetName, assetResponse.data);
    } catch (assetError) {
      console.error(`Failed to fetch asset ${assetUrl}:`, assetError.message);
    }
  }));
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

    // Run HTTrack to download the website
    shell.exec(`httrack ${websiteUrl} -O ${baseDir} -v`);

    if (shell.error()) {
      throw new Error('HTTrack failed');
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
