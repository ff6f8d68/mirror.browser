const { Builder, By } = require('selenium-webdriver');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { parse } = require('url');

// Function to save HTML content and assets locally
async function saveContent(baseDir, fileName, content) {
  const filePath = path.join(baseDir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

// Function to fetch and save assets
async function saveAssets(driver, websiteUrl, baseDir) {
  const assets = new Set();

  const assetElements = await driver.findElements(By.css('img[src], link[href], script[src], iframe[src], audio[src], video[src], embed[src], source[src]'));
  for (const assetElement of assetElements) {
    const url = await assetElement.getAttribute('src') || await assetElement.getAttribute('href');
    if (url && url.startsWith('http')) {
      assets.add(new URL(url, websiteUrl).href);
    }
  }

  await Promise.all(
    Array.from(assets).map(async (assetUrl) => {
      try {
        const assetResponse = await axios.get(assetUrl, { responseType: 'arraybuffer' });
        const assetName = path.basename(new URL(assetUrl).pathname);
        await saveContent(baseDir, assetName, assetResponse.data);
      } catch (assetError) {
        console.error(`Failed to fetch asset ${assetUrl}:`, assetError.message);
      }
    })
  );
}

// Function to scrape pages recursively
async function scrapePage(driver, websiteUrl, baseDir, visited) {
  if (visited.has(websiteUrl)) {
    return;
  }
  visited.add(websiteUrl);

  await driver.get(websiteUrl);
  await driver.sleep(3000); // Wait for the page to load completely

  let html = await driver.getPageSource();

  const pageName = websiteUrl.replace(/[^a-z0-9 .]/gi, '_').toLowerCase() + '.html';
  await saveContent(baseDir, pageName, html);

  await saveAssets(driver, websiteUrl, baseDir);

  const links = await driver.findElements(By.css('a[href]'));
  for (const link of links) {
    const href = await link.getAttribute('href');
    if (href && href.startsWith(websiteUrl)) {
      await scrapePage(driver, href, baseDir, visited);
    }
  }
}

async function scrapeWebsite(websiteUrl, baseDir) {
  let driver = await new Builder().forBrowser('chrome').build();

  try {
    const visited = new Set();
    await scrapePage(driver, websiteUrl, baseDir, visited);
  } finally {
    await driver.quit();
  }
}

async function createZip(baseDir, outputFilePath) {
  const zip = new AdmZip();
  zip.addLocalFolder(baseDir);
  zip.writeZip(outputFilePath);
}

exports.handler = async (event, context) => {
  try {
    const { websiteUrl } = event.queryStringParameters;
    if (!websiteUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing websiteUrl parameter' }),
      };
    }

    const websiteName = parse(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    const baseDir = path.join(__dirname, 'core', 'mirror', websiteName);
    const outputFilePath = path.join(__dirname, 'core', 'mirror', `${websiteName}.zip`);

    // Clear the base directory
    fs.rmSync(baseDir, { recursive: true, force: true });

    await scrapeWebsite(websiteUrl, baseDir);
    await createZip(baseDir, outputFilePath);

    const zipContent = fs.readFileSync(outputFilePath);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${websiteName}.zip`,
      },
      body: zipContent.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
