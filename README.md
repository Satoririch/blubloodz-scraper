# BluBloodz Pedigree Verification Agent 🐕

## What This Does
One-click pedigree + health verification for Cane Corsos. Scrapes canecorsopedigree.com and returns structured, verified health data ready for the BluBloodz trust score.

## API Endpoints

### 1. `GET /api/verify-pedigree`
Searches and scrapes dog profiles from canecorsopedigree.com.

**Search by name:**
```
GET /api/verify-pedigree?name=HEART SKIPS PHOENIX BEAUTY
```

**Get by ID (if you know it):**
```
GET /api/verify-pedigree?id=110391
```

**Returns:**
- Registered name, sex, DOB, color
- Sire + Dam (with links to their profiles)
- Pedigree number & titles
- HD score (hips), ED score (elbows)
- DSRA result + certification status
- DVL2 result + certification status
- DNA parentage confirmation
- Inbreeding coefficient
- Children & siblings
- **Trust Verification Score (0-100)**

### 2. `POST /api/save-verification`
Saves verified data to Supabase.

**Body:**
```json
{
  "dog_id": "uuid-from-dogs-table",
  "verification_data": { /* output from verify-pedigree */ }
}
```

**Writes to:**
- `health_records` table (hips, elbows, DSRA, DVL2, cardiac)
- `pedigrees` table (sire, dam, lineage, pedigree number)

## Deployment (Vercel)

### Step 1: Push to GitHub
```bash
cd blubloodz-scraper
git init
git add .
git commit -m "Pedigree verification agent"
git remote add origin https://github.com/YOUR_USERNAME/blubloodz-scraper.git
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to vercel.com → New Project
2. Import the blubloodz-scraper repo
3. Add environment variables:
   - `SUPABASE_URL` = https://wtldddwmceirjdbhtrve.supabase.co
   - `SUPABASE_SERVICE_KEY` = (your service role key from Supabase Settings → API)
4. Deploy!

### Step 3: Test
```
https://your-vercel-url.vercel.app/api/verify-pedigree?name=HEART%20SKIPS%20PHOENIX%20BEAUTY
```

## Trust Score Breakdown
| Check | Points |
|-------|--------|
| Sire verified | 12.5 |
| Dam verified | 12.5 |
| Hip score on file | 20 |
| Hip score good/excellent | +5 bonus |
| Elbow score on file | 20 |
| Elbow score clear | +5 bonus |
| DSRA tested | 10 |
| DSRA certified | +2.5 bonus |
| DVL2 tested | 10 |
| DVL2 certified | +2.5 bonus |
| DNA parentage confirmed | 5 |
| Pedigree # registered | 5 |
| **Max possible** | **100** |

## File Structure
```
blubloodz-scraper/
├── api/
│   ├── verify-pedigree.js   ← Scrapes canecorsopedigree.com
│   └── save-verification.js ← Writes results to Supabase
├── test-parser.js            ← Local test (works offline)
├── vercel.json               ← Vercel routing config
├── package.json
└── README.md
```

## Cost: $0/month
- Vercel free tier: 100K requests/month
- No AI API calls needed (pure HTML parsing)
- Supabase free tier for database writes
