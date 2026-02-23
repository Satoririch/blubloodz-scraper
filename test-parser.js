/**
 * Test the parser with real HTML from canecorsopedigree.com
 * This HTML was fetched from: https://canecorsopedigree.com/view_dog?id=110391
 */

const cheerio = require('cheerio');

// Simulated HTML from the actual dog profile page (ID 110391)
const sampleHTML = `
<table>
<tr><td>Name</td><td><a href="/view_pedigree?id=110391">HEART SKIPS PHOENIX BEAUTY</a> (click to view pedigree)</td></tr>
<tr><td>Gender</td><td>female</td></tr>
<tr><td>Father</td><td><a href="/view_dog?id=87626">UNION LA MIA FORTUNA BE COME THE STAR DRAGON</a></td></tr>
<tr><td>Mother</td><td><a href="/view_dog?id=85609">ENIGMA BLUE STAR PHOENIX BEAUTY</a></td></tr>
<tr><td>Dog Parental DNA Confirmed</td><td>No</td></tr>
<tr><td>Ped#</td><td>LV-47136/19</td></tr>
<tr><td>Titles</td><td></td></tr>
<tr><td>Extra titles</td><td>LV, LT, EST, Baltic JCH; LV, LT, EST, Baltic CH</td></tr>
<tr><td>DOB</td><td>2019/06/24</td></tr>
<tr><td>Colour</td><td>Grey brindle/Grigio tigrato</td></tr>
<tr><td>HD</td><td>HD A</td></tr>
<tr><td>ED</td><td>0/Free/Vrij</td></tr>
<tr><td>Heart</td><td></td></tr>
<tr><td>Date of death</td><td>YYYY/MM/DD</td></tr>
<tr><td>Other healthscores</td><td></td></tr>
<tr><td>DNA PROFILE</td><td></td></tr>
<tr><td>DSRA Result</td><td>CLEAR</td></tr>
<tr><td>DSRA Result Certified</td><td>YES</td></tr>
<tr><td>DVL2 Result</td><td>UNKNOWN</td></tr>
<tr><td>DVL2 Result Certified</td><td>NO</td></tr>
<tr><td>DNA Test Inbred percentage</td><td></td></tr>
<tr><td>Inbred percentage</td><td><a href="/view_coi?dogId=110391">6.887995486613363%</a></td></tr>
<tr><td>Added by</td><td>vilma</td></tr>
</table>
`;

// ============================================
// Parser (same logic as verify-pedigree.js)
// ============================================
function parseDogProfile(html, dogId) {
  const $ = cheerio.load(html);
  const BASE_URL = 'https://www.canecorsopedigree.com';

  const data = {
    source: 'canecorsopedigree.com',
    source_url: `${BASE_URL}/view_dog?id=${dogId}`,
    source_id: dogId,
    verified_at: new Date().toISOString(),
  };

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

  // Calculate verification score
  let score = 0;
  const breakdown = {};

  if (data.sire && data.sire.name) { score += 12.5; breakdown.sire_verified = true; }
  if (data.dam && data.dam.name) { score += 12.5; breakdown.dam_verified = true; }
  if (data.hd_score && data.hd_score !== 'unknown') {
    score += 20; breakdown.hd_verified = true;
    if (['HD-', 'HD A', 'OFA Excellent', 'OFA Good'].includes(data.hd_score)) {
      score += 5; breakdown.hd_rating = 'excellent/good';
    }
  }
  if (data.ed_score && data.ed_score !== 'Unknown') {
    score += 20; breakdown.ed_verified = true;
    if (['0/Free/Vrij', 'OFA Normal'].includes(data.ed_score)) {
      score += 5; breakdown.ed_rating = 'clear';
    }
  }
  if (data.dsra_result && data.dsra_result !== 'UNKNOWN') {
    score += 10; breakdown.dsra_tested = true;
    if (data.dsra_certified) { score += 2.5; breakdown.dsra_certified = true; }
  }
  if (data.dvl2_result && data.dvl2_result !== 'UNKNOWN') {
    score += 10; breakdown.dvl2_tested = true;
  }
  if (data.dna_confirmed) { score += 5; breakdown.dna_confirmed = true; }
  if (data.pedigree_number) { score += 5; breakdown.pedigree_registered = true; }

  data.verification_score = {
    score: Math.round(Math.min(score, 100)),
    breakdown,
    max_possible: 100,
  };

  return data;
}

// ============================================
// Run the test
// ============================================
console.log('🧪 Testing BluBloodz Pedigree Verification Parser\n');
console.log('='.repeat(60));

const result = parseDogProfile(sampleHTML, '110391');

console.log('\n✅ PARSED DOG PROFILE:\n');
console.log(`  📛 Name: ${result.registered_name}`);
console.log(`  ♀️  Sex: ${result.sex}`);
console.log(`  🐕 Sire: ${result.sire?.name} (ID: ${result.sire?.id})`);
console.log(`  🐕 Dam: ${result.dam?.name} (ID: ${result.dam?.id})`);
console.log(`  📝 Pedigree #: ${result.pedigree_number}`);
console.log(`  🎂 DOB: ${result.date_of_birth}`);
console.log(`  🎨 Color: ${result.color}`);
console.log(`  🏆 Titles: ${result.extra_titles}`);

console.log('\n🏥 HEALTH SCORES:\n');
console.log(`  🦴 Hips (HD): ${result.hd_score}`);
console.log(`  🦴 Elbows (ED): ${result.ed_score}`);
console.log(`  🧬 DSRA: ${result.dsra_result} (Certified: ${result.dsra_certified})`);
console.log(`  🧬 DVL2: ${result.dvl2_result} (Certified: ${result.dvl2_certified})`);
console.log(`  🧬 DNA Confirmed: ${result.dna_confirmed}`);
console.log(`  📊 Inbreeding: ${result.inbreeding_coefficient}%`);

console.log('\n🏅 TRUST VERIFICATION SCORE:\n');
console.log(`  Score: ${result.verification_score.score}/100`);
console.log(`  Breakdown:`, JSON.stringify(result.verification_score.breakdown, null, 4));

console.log('\n📦 FULL JSON OUTPUT:\n');
console.log(JSON.stringify(result, null, 2));

// ============================================
// Map to Supabase health_records format
// ============================================
console.log('\n\n📊 MAPPED TO SUPABASE health_records FORMAT:\n');

const healthRecords = [];

if (result.hd_score) {
  healthRecords.push({
    test_type: 'hips',
    result: result.hd_score,
    status: ['HD-', 'HD A', 'HD B', 'OFA Excellent', 'OFA Good', 'OFA Fair'].includes(result.hd_score) ? 'pass' : 'review',
    verification_source: 'canecorsopedigree.com',
    verification_status: 'verified',
    verified_at: result.verified_at,
  });
}

if (result.ed_score) {
  healthRecords.push({
    test_type: 'elbows',
    result: result.ed_score,
    status: ['0/Free/Vrij', 'OFA Normal'].includes(result.ed_score) ? 'pass' : 'review',
    verification_source: 'canecorsopedigree.com',
    verification_status: 'verified',
    verified_at: result.verified_at,
  });
}

if (result.dsra_result && result.dsra_result !== 'UNKNOWN') {
  healthRecords.push({
    test_type: 'dsra',
    result: result.dsra_result,
    status: result.dsra_result === 'CLEAR' ? 'pass' : 'review',
    certification_verified: result.dsra_certified,
    verification_source: 'canecorsopedigree.com',
    verification_status: 'verified',
    verified_at: result.verified_at,
  });
}

if (result.dvl2_result && result.dvl2_result !== 'UNKNOWN') {
  healthRecords.push({
    test_type: 'dvl2',
    result: result.dvl2_result,
    status: result.dvl2_result === 'CLEAR' ? 'pass' : 'review',
    certification_verified: result.dvl2_certified,
    verification_source: 'canecorsopedigree.com',
    verification_status: 'verified',
    verified_at: result.verified_at,
  });
}

healthRecords.forEach((rec, i) => {
  console.log(`  Record ${i + 1}: ${rec.test_type} → ${rec.result} (${rec.status}) [${rec.verification_status}]`);
});

console.log('\n✅ Parser test complete!');
