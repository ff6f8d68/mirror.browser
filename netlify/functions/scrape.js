const { Builder, By } = require('selenium-webdriver');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { parse } = require('url');

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

async function uploadFolderToGitHub(baseDir, baseRepoPath) {
  const files = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(baseDir, file.name);
    const repoPath = path.join(baseRepoPath, file.name);

    if (file.isDirectory()) {
      await uploadFolderToGitHub(fullPath, repoPath);
    } else {
      const content = fs.readFileSync(fullPath);
      await uploadToGitHub(repoPath, content, `Add ${repoPath}`);
    }
  }
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

    // Clear the base directory
    fs.rmSync(baseDir, { recursive: true, force: true });

    await scrapeWebsite(websiteUrl, baseDir);
    await uploadFolderToGitHub(baseDir, `core/mirror/${websiteName}`);

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
