/**
 * BluBloodz - Write Verification Results to Supabase
 * 
 * POST /api/save-verification
 * Body: { dog_id, verification_data }
 * 
 * Takes the output from verify-pedigree and writes:
 * 1. Health records to health_records table
 * 2. Pedigree data to pedigrees table
 * 3. Updates dog record with verification metadata
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
 */

const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

async function supabaseRequest(path, method, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const options = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { dog_id, verification_data } = req.body;

  if (!dog_id || !verification_data) {
    return res.status(400).json({
      error: 'Required: dog_id (UUID from dogs table) and verification_data (from verify-pedigree)',
    });
  }

  try {
    const results = {
      health_records_created: [],
      pedigree_created: null,
      dog_updated: false,
    };

    // ========================================
    // 1. Insert health records
    // ========================================
    const healthTests = [];

    if (verification_data.hd_score) {
      healthTests.push({
        dog_id,
        test_type: 'hips',
        result: verification_data.hd_score,
        test_date: verification_data.date_of_birth || null, // Best proxy we have
        verification_source: 'canecorsopedigree.com',
        verification_status: 'verified',
        notes: `HD score: ${verification_data.hd_score}. Source: ${verification_data.source_url}`,
      });
    }

    if (verification_data.ed_score) {
      healthTests.push({
        dog_id,
        test_type: 'elbows',
        result: verification_data.ed_score,
        test_date: verification_data.date_of_birth || null,
        verification_source: 'canecorsopedigree.com',
        verification_status: 'verified',
        notes: `ED score: ${verification_data.ed_score}. Source: ${verification_data.source_url}`,
      });
    }

    if (verification_data.dsra_result && verification_data.dsra_result !== 'UNKNOWN') {
      healthTests.push({
        dog_id,
        test_type: 'dsra',
        result: `${verification_data.dsra_result}${verification_data.dsra_certified ? ' (Certified)' : ''}`,
        verification_source: 'canecorsopedigree.com',
        verification_status: 'verified',
        notes: `DSRA: ${verification_data.dsra_result}, Certified: ${verification_data.dsra_certified}. Source: ${verification_data.source_url}`,
      });
    }

    if (verification_data.dvl2_result && verification_data.dvl2_result !== 'UNKNOWN') {
      healthTests.push({
        dog_id,
        test_type: 'dvl2',
        result: `${verification_data.dvl2_result}${verification_data.dvl2_certified ? ' (Certified)' : ''}`,
        verification_source: 'canecorsopedigree.com',
        verification_status: 'verified',
        notes: `DVL2: ${verification_data.dvl2_result}, Certified: ${verification_data.dvl2_certified}. Source: ${verification_data.source_url}`,
      });
    }

    if (verification_data.heart) {
      healthTests.push({
        dog_id,
        test_type: 'cardiac',
        result: verification_data.heart,
        verification_source: 'canecorsopedigree.com',
        verification_status: 'verified',
        notes: `Heart: ${verification_data.heart}. Source: ${verification_data.source_url}`,
      });
    }

    // Insert all health records
    if (healthTests.length > 0) {
      const inserted = await supabaseRequest('health_records', 'POST', healthTests);
      results.health_records_created = inserted;
    }

    // ========================================
    // 2. Insert pedigree record
    // ========================================
    const pedigreeData = {
      dog_id,
      sire_name: verification_data.sire?.name || null,
      dam_name: verification_data.dam?.name || null,
      lineage: JSON.stringify({
        sire: verification_data.sire || null,
        dam: verification_data.dam || null,
        pedigree_number: verification_data.pedigree_number,
        inbreeding_coefficient: verification_data.inbreeding_coefficient,
        titles: verification_data.extra_titles || verification_data.titles,
        source_id: verification_data.source_id,
      }),
      verification_source: 'canecorsopedigree.com',
      verification_status: 'verified',
    };

    const pedigreeInserted = await supabaseRequest('pedigrees', 'POST', pedigreeData);
    results.pedigree_created = pedigreeInserted;

    // ========================================
    // 3. Calculate and return trust score
    // ========================================
    results.trust_score = verification_data.verification_score;

    return res.status(200).json({
      success: true,
      message: `Verified ${verification_data.registered_name}. Created ${healthTests.length} health records and 1 pedigree record.`,
      results,
    });

  } catch (error) {
    console.error('Save verification error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
