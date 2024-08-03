const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const { parse } = require('url');
const { Buffer } = require('buffer');
const sanitizeHtml = require('sanitize-html');

// GitHub repository information
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'ff6f8d68';
const REPO_NAME = 'mirror.browser';
const BRANCH = 'main';

// Create GitHub API client
const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function uploadToGitHub(pathInRepo, content, message) {
  const { data: { sha } } = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}?ref=${BRANCH}`).catch(() => ({ data: {} }));
  
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

    const websiteName = parse(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    const baseDir = `core/mirror/${websiteName}`;

    // Launch Puppeteer
    const browser = await puppeteer.launch({
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

    // Take a screenshot of the page
    const pageScreenshot = await page.screenshot({ type: 'png' });
    await uploadToGitHub(`${baseDir}/page-screenshot.png`, pageScreenshot, 'Add page screenshot');

    await browser.close();

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
