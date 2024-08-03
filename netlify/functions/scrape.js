const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { parse } = require('url');
const sanitizeHtml = require('sanitize-html');
const { Buffer } = require('buffer');

// GitHub repository information
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'ff6f8d68'; // Replace with your GitHub username or organization
const REPO_NAME = 'mirror.browser'; // Replace with your GitHub repository name
const BRANCH = 'main'; // Replace with the branch you want to update

// Create GitHub API client
const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function uploadToGitHub(pathInRepo, content, message) {
  // Get the SHA of the file (if exists) to update
  const { data: { sha } } = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}?ref=${BRANCH}`).catch(() => ({ data: {} }));
  
  // Create or update file
  await githubApi.put(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    branch: BRANCH
  });
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

    const websiteName = parse(websiteUrl).hostname.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const baseDir = `core/mirror/${websiteName}`;

    // Fetch the website content
    const response = await axios.get(websiteUrl);
    let html = response.data;

    // Sanitize HTML content
    html = sanitizeHtml(html, {
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'img', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      allowedAttributes: {
        'a': ['href', 'name', 'target'],
        'img': ['src', 'alt', 'width', 'height'],
        'span': ['style'],
        'div': ['style'],
        'table': ['style'],
        'th': ['style'],
        'td': ['style'],
      },
      allowedIframeHostnames: ['www.youtube.com'],
      transformTags: {
        'script': function(tagName, attribs) {
          // Remove <script> tags or neutralize them
          return { tagName: 'noscript', attribs: {} };
        },
        'style': function(tagName, attribs) {
          // Remove <style> tags or neutralize them
          return { tagName: 'noscript', attribs: {} };
        },
        'iframe': function(tagName, attribs) {
          // Remove <iframe> tags or neutralize them
          return { tagName: 'noscript', attribs: {} };
        }
      }
    });

    // Save the sanitized HTML file to GitHub
    await uploadToGitHub(`${baseDir}/index.html`, html, 'Add sanitized website index.html');

    // Parse the HTML content
    const $ = cheerio.load(html);

    // Collect asset URLs
    const assets = [];
    $('img[src], link[href], script[src]').each((i, el) => {
      const assetUrl = $(el).attr('src') || $(el).attr('href');
      if (assetUrl) {
        const fullUrl = new URL(assetUrl, websiteUrl).href;
        assets.push(fullUrl);
      }
    });

    // Download and save assets to GitHub
    await Promise.all(assets.map(async (assetUrl) => {
      try {
        const assetResponse = await axios.get(assetUrl, { responseType: 'arraybuffer' });
        const assetName = path.basename(new URL(assetUrl).pathname);
        await uploadToGitHub(`${baseDir}/${assetName}`, assetResponse.data, `Add asset ${assetName}`);
      } catch (assetError) {
        console.error(`Failed to fetch asset ${assetUrl}:`, assetError.message);
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Website saved successfully' }),
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
