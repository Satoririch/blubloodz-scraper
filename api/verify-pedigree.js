/**
 * BluBloodz Pedigree Verification Agent
 * 
 * Scrapes canecorsopedigree.com to verify a Cane Corso's:
 * - Pedigree (sire, dam, lineage)
 * - Health scores (HD, ED, DSRA, DVL2)
 * - Registration info (pedigree number, titles, DOB, color)
 * - Inbreeding coefficient
 * - Children and siblings
 * 
 * Usage: GET /api/verify-pedigree?name=DOGNAME
 *        GET /api/verify-pedigree?id=110391
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.canecorsopedigree.com';

// ============================================
// STEP 1: Search for a dog by name
// ============================================
async function searchDog(searchTerm) {
  const url = `${BASE_URL}/search_dog_results?searchTerm=${encodeURIComponent(searchTerm)}&orderBy=dog_name&order=ASC`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  
  const results = [];
  
  // Parse search results table
  $('table tr').each((i, row) => {
    if (i === 0) return; // Skip header row
    
    const cells = $(row).find('td');
    if (cells.length === 0) return;
    
    const nameLink = $(cells[0]).find('a');
    const href = nameLink.attr('href');
    
    if (href && href.includes('view_dog')) {
      const idMatch = href.match(/id=(\d+)/);
      results.push({
        id: idMatch ? idMatch[1] : null,
        name: nameLink.text().trim(),
        ped_number: $(cells[1]).text().trim(),
        titles: $(cells[2]).text().trim(),
        dob: $(cells[3]).text().trim(),
        color: $(cells[4]).text().trim(),
        hd: $(cells[5]).text().trim(),
        ed: $(cells[6]).text().trim(),
        url: `${BASE_URL}${href}`,
      });
    }
  });

  return results;
}

// ============================================
// STEP 2: Scrape full dog profile by ID
// ============================================
async function scrapeDogProfile(dogId) {
  const url = `${BASE_URL}/view_dog?id=${dogId}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });

  if (!response.ok) {
    throw new Error(`Profile fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Parse the profile table - data is in key/value rows
  const data = {
    source: 'canecorsopedigree.com',
    source_url: url,
    source_id: dogId,
    verified_at: new Date().toISOString(),
  };

  // Extract all table rows looking for label/value pairs
  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const label = $(cells[0]).text().trim().toLowerCase();
      const valueCell = $(cells[1]);
      const value = valueCell.text().trim();
      const link = valueCell.find('a').attr('href');

      switch (label) {
        case 'name':
          data.registered_name = value.replace('(click to view pedigree)', '').trim();
          if (link) {
            const pedigreeIdMatch = link.match(/id=(\d+)/);
            if (pedigreeIdMatch) data.pedigree_view_id = pedigreeIdMatch[1];
          }
          break;
        case 'gender':
          data.sex = value.toLowerCase();
          break;
        case 'father':
          data.sire = {
            name: value,
            url: link ? `${BASE_URL}${link}` : null,
            id: link ? (link.match(/id=(\d+)/) || [])[1] : null,
          };
          break;
        case 'mother':
          data.dam = {
            name: value,
            url: link ? `${BASE_URL}${link}` : null,
            id: link ? (link.match(/id=(\d+)/) || [])[1] : null,
          };
          break;
        case 'dog parental dna confirmed':
          data.dna_confirmed = value.toLowerCase() === 'yes';
          break;
        case 'ped#':
          data.pedigree_number = value;
          break;
        case 'titles':
          data.titles = value || null;
          break;
        case 'extra titles':
          data.extra_titles = value || null;
          break;
        case 'dob':
          data.date_of_birth = value !== 'YYYY/MM/DD' ? value : null;
          break;
        case 'colour':
          data.color = value;
          break;
        case 'hd':
          data.hd_score = value || null;
          break;
        case 'ed':
          data.ed_score = value || null;
          break;
        case 'heart':
          data.heart = value || null;
          break;
        case 'date of death':
          data.date_of_death = value !== 'YYYY/MM/DD' ? value : null;
          break;
        case 'other healthscores':
          data.other_health = value || null;
          break;
        case 'dna profile':
          data.dna_profile = value || null;
          break;
        case 'dsra result':
          data.dsra_result = value || null;
          break;
        case 'dsra result certified':
          data.dsra_certified = value.toLowerCase() === 'yes';
          break;
        case 'dvl2 result':
          data.dvl2_result = value || null;
          break;
        case 'dvl2 result certified':
          data.dvl2_certified = value.toLowerCase() === 'yes';
          break;
        case 'dna test inbred percentage':
          data.dna_inbreeding = value || null;
          break;
        case 'inbred percentage':
          const pctMatch = value.match(/([\d.]+)%/);
          data.inbreeding_coefficient = pctMatch ? parseFloat(pctMatch[1]) : null;
          break;
        case 'added by':
          data.added_by = value;
          break;
      }
    }
  });

  // Parse children table
  data.children = parseRelativesTable($, 'children');
  
  // Parse siblings table
  data.siblings = parseRelativesTable($, 'Brothers and sisters');

  // Calculate a verification score
  data.verification_score = calculateVerificationScore(data);

  return data;
}

// ============================================
// Helper: Parse children/siblings tables
// ============================================
function parseRelativesTable($, sectionTitle) {
  const results = [];
  let foundSection = false;

  $('td').each((i, cell) => {
    const text = $(cell).text().trim();
    if (text === sectionTitle) {
      foundSection = true;
    }
  });

  if (!foundSection) return results;

  // Find the table after the section title
  $('table table').each((i, table) => {
    const headerText = $(table).find('tr:first-child').text();
    if (headerText.includes('Name') && headerText.includes('Ped#') && headerText.includes('HD')) {
      $(table).find('tr').each((j, row) => {
        if (j === 0) return; // Skip header
        const cells = $(row).find('td');
        if (cells.length >= 7) {
          const nameLink = $(cells[0]).find('a');
          const href = nameLink.attr('href');
          results.push({
            name: nameLink.text().trim(),
            id: href ? (href.match(/id=(\d+)/) || [])[1] : null,
            ped_number: $(cells[1]).text().trim(),
            titles: $(cells[2]).text().trim(),
            dob: $(cells[3]).text().trim(),
            color: $(cells[4]).text().trim(),
            hd: $(cells[5]).text().trim(),
            ed: $(cells[6]).text().trim(),
          });
        }
      });
    }
  });

  return results;
}

// ============================================
// Calculate verification score (0-100)
// ============================================
function calculateVerificationScore(data) {
  let score = 0;
  const breakdown = {};

  // Pedigree verified (sire + dam known) = 25 points
  if (data.sire && data.sire.name) {
    score += 12.5;
    breakdown.sire_verified = true;
  }
  if (data.dam && data.dam.name) {
    score += 12.5;
    breakdown.dam_verified = true;
  }

  // Hip score on file = 20 points
  if (data.hd_score && data.hd_score !== 'unknown') {
    score += 20;
    breakdown.hd_verified = true;
    // Bonus for good hips
    if (['HD-', 'HD A', 'OFA Excellent', 'OFA Good'].includes(data.hd_score)) {
      score += 5;
      breakdown.hd_rating = 'excellent/good';
    }
  }

  // Elbow score on file = 20 points
  if (data.ed_score && data.ed_score !== 'Unknown') {
    score += 20;
    breakdown.ed_verified = true;
    if (['0/Free/Vrij', 'OFA Normal'].includes(data.ed_score)) {
      score += 5;
      breakdown.ed_rating = 'clear';
    }
  }

  // DSRA tested = 10 points
  if (data.dsra_result && data.dsra_result !== 'UNKNOWN') {
    score += 10;
    breakdown.dsra_tested = true;
    if (data.dsra_certified) {
      score += 2.5;
      breakdown.dsra_certified = true;
    }
  }

  // DVL2 tested = 10 points
  if (data.dvl2_result && data.dvl2_result !== 'UNKNOWN') {
    score += 10;
    breakdown.dvl2_tested = true;
    if (data.dvl2_certified) {
      score += 2.5;
      breakdown.dvl2_certified = true;
    }
  }

  // DNA parentage confirmed = 5 points
  if (data.dna_confirmed) {
    score += 5;
    breakdown.dna_confirmed = true;
  }

  // Pedigree number on file = 5 points
  if (data.pedigree_number) {
    score += 5;
    breakdown.pedigree_registered = true;
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score: Math.round(score),
    breakdown,
    max_possible: 100,
  };
}

// ============================================
// Main handler (Vercel serverless function)
// ============================================
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { name, id } = req.query;

  try {
    // If ID provided, go directly to profile
    if (id) {
      const profile = await scrapeDogProfile(id);
      return res.status(200).json({
        success: true,
        type: 'profile',
        data: profile,
      });
    }

    // If name provided, search first
    if (name) {
      const searchResults = await searchDog(name);

      if (searchResults.length === 0) {
        return res.status(200).json({
          success: true,
          type: 'search',
          message: `No dogs found matching "${name}"`,
          results: [],
        });
      }

      // If exactly one result, auto-fetch the full profile
      if (searchResults.length === 1) {
        const profile = await scrapeDogProfile(searchResults[0].id);
        return res.status(200).json({
          success: true,
          type: 'profile',
          message: `Found exact match for "${name}"`,
          data: profile,
        });
      }

      // Multiple results - return list for user to choose
      return res.status(200).json({
        success: true,
        type: 'search',
        message: `Found ${searchResults.length} dogs matching "${name}"`,
        results: searchResults,
      });
    }

    // No params
    return res.status(400).json({
      success: false,
      error: 'Provide ?name=DOGNAME or ?id=12345',
      example: '/api/verify-pedigree?name=HEART%20SKIPS%20PHOENIX%20BEAUTY',
    });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// CLI test mode
// ============================================
if (require.main === module) {
  const testId = process.argv[2] || '110391';
  const testName = process.argv[3];

  (async () => {
    try {
      if (testName) {
        console.log(`\n🔍 Searching for: "${testName}"...\n`);
        const results = await searchDog(testName);
        console.log(`Found ${results.length} results:`);
        results.forEach((r, i) => {
          console.log(`  ${i + 1}. ${r.name} (ID: ${r.id}) - ${r.dob} - HD: ${r.hd} ED: ${r.ed}`);
        });
        
        if (results.length > 0) {
          console.log(`\n📋 Fetching full profile for: ${results[0].name}...\n`);
          const profile = await scrapeDogProfile(results[0].id);
          console.log(JSON.stringify(profile, null, 2));
        }
      } else {
        console.log(`\n📋 Fetching profile for ID: ${testId}...\n`);
        const profile = await scrapeDogProfile(testId);
        console.log(JSON.stringify(profile, null, 2));
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  })();
}
