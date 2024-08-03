const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { parse } = require('url');
const sanitizeHtml = require('sanitize-html');
const { Buffer } = require('buffer');
const fs = require('fs');

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

async function parseDataUrl(dataUrl) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (matches.length !== 3) {
    throw new Error('Could not parse data URL.');
  }
  return { mime: matches[1], buffer: Buffer.from(matches[2], 'base64') };
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
    const baseDir = `core/mirror/${websiteName}`;

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(websiteUrl, { waitUntil: 'networkidle2' });

    // Get page content
    let html = await page.content();

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
          return { tagName: 'noscript', attribs: {} };
        },
        'style': function(tagName, attribs) {
          return { tagName: 'noscript', attribs: {} };
        },
        'iframe': function(tagName, attribs) {
          return { tagName: 'noscript', attribs: {} };
        }
      }
    });

    // Save the sanitized HTML file to GitHub
    await uploadToGitHub(`${baseDir}/index.html`, html, 'Add sanitized website index.html');

    // Get and save GoJS diagram screenshot
    const imageData = await page.evaluate(() => {
      // Assuming window.myDiagram is available
      if (window.myDiagram) {
        window.myDiagram.animationManager.stopAnimation();
        return window.myDiagram.makeImageData({
          background: window.myDiagram.div.style.backgroundColor
        });
      }
      return null;
    });

    if (imageData) {
      const { buffer } = await parseDataUrl(imageData);
      await uploadToGitHub(`${baseDir}/diagram-screenshot.png`, buffer, 'Add GoJS diagram screenshot');
    }

    // Get and save page screenshot
    const pageScreenshot = await page.screenshot({ type: 'png' });
    await uploadToGitHub(`${baseDir}/page-screenshot.png`, pageScreenshot, 'Add page screenshot');

    await browser.close();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Website and screenshots saved successfully' }),
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
