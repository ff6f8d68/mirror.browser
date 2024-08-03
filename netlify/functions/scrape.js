const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const { parse } = require('url');

exports.handler = async (event, context) => {
  try {
    // Get the website URL from query parameters
    const { websiteUrl } = event.queryStringParameters;
    if (!websiteUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing websiteUrl parameter' }),
      };
    }

    // Create a directory for storing the website content
    const websiteName = parse(websiteUrl).hostname;
    const saveDir = path.join('/tmp', websiteName); // Netlify functions use /tmp for temp files

    // Ensure the directory exists
    await fs.mkdir(saveDir, { recursive: true });

    // Fetch the website content
    const response = await axios.get(websiteUrl);
    const html = response.data;

    // Parse the HTML content
    const $ = cheerio.load(html);

    // Save the main HTML file
    const htmlPath = path.join(saveDir, 'index.html');
    await fs.writeFile(htmlPath, html, 'utf-8');

    // Collect assets
    const assets = [];
    $('img[src], link[href], script[src]').each((i, el) => {
      const assetUrl = $(el).attr('src') || $(el).attr('href');
      if (assetUrl) assets.push(new URL(assetUrl, websiteUrl).href);
    });

    // Download assets
    await Promise.all(assets.map(async (assetUrl) => {
      const assetResponse = await axios.get(assetUrl, { responseType: 'arraybuffer' });
      const assetName = path.basename(new URL(assetUrl).pathname);
      const assetPath = path.join(saveDir, assetName);
      await fs.writeFile(assetPath, assetResponse.data);
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Website saved successfully', saveDir }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
