// One-off seed script — populates sample tailor accounts/profiles, plus
// one real design photo per tailor. Names, specialties, skills, and the
// design photos themselves are taken directly from the reference
// mockup's "Meet Our Featured Tailors" section — these are real photos
// from your own project brief, not AI-generated placeholders.
//
// Log in with any account below (password: password123) and use the
// tailor dashboard to add further real designs of your own.
//
// Safe to re-run: it skips anyone whose email already exists.
//
// Usage:  node server/seed.js
const db = require('./db');
const { hashPassword } = require('./auth');

const SEED_PASSWORD = 'password123';

const tailors = [
  {
    full_name: 'Fatima Abdullahi',
    email: 'fatima.tailor@example.com',
    specialty: 'Senior Artisan',
    skills: 'Aso-Oke, Ankara Fusion, Bridal, Embroidery',
    bio: 'Specialises in Aso-Oke bridal collections and Ankara fusion wear with over 8 years of practice in Keffi.',
    phone: '0803 000 0001',
    location: 'Keffi, Nasarawa State',
    design: {
      title: 'Bridal Aso-Oke Ensemble', category: 'Traditional', price: '85000', image: 'fatima.jpg',
      description: 'A hand-woven Aso-Oke bridal ensemble with matching gele and accessories.',
    },
  },
  {
    full_name: 'Ibrahim Musa',
    email: 'ibrahim.tailor@example.com',
    specialty: 'Corporate Specialist',
    skills: 'Corporate Suits, Senator Styles, Uniforms, Agbada',
    bio: "Expert in bespoke men's corporate suiting, Senator styles, and institutional uniform design.",
    phone: '0803 000 0002',
    location: 'Lafia, Nasarawa State',
    design: {
      title: 'Agbada Formal Set', category: 'Corporate', price: '120000', image: 'ibrahim.jpg',
      description: 'A tailored Agbada set for formal and ceremonial occasions.',
    },
  },
  {
    full_name: 'Grace Okeke',
    email: 'grace.tailor@example.com',
    specialty: 'Bridal Couturier',
    skills: 'Bridal Gowns, George Fabric, Igbo Traditional, Lace',
    bio: 'Renowned for breathtaking bridal gowns blending Western silhouettes with vibrant Igbo traditional aesthetics.',
    phone: '0803 000 0003',
    location: 'Keffi, Nasarawa State',
    design: {
      title: 'Ankara Bridal Gown', category: 'Bridal', price: '110000', image: 'grace.jpg',
      description: 'A modern bridal gown finished with bold hand-stitched Ankara detailing.',
    },
  },
  {
    full_name: 'Aliyu Yusuf',
    email: 'aliyu.tailor@example.com',
    specialty: 'Heritage Specialist',
    skills: 'Babban Riga, Jalabiya, Hausa Embroidery, Kaftan',
    bio: 'Master of Northern Nigerian heritage garments — Babban Riga, Jalabiya, and custom embroidered gowns.',
    phone: '0803 000 0004',
    location: 'Gudi, Nasarawa State',
    design: {
      title: 'Heritage Dashiki Ensemble', category: 'Heritage', price: '60000', image: 'aliyu.jpg',
      description: 'A richly patterned Dashiki ensemble, hand-finished in the traditional style.',
    },
  },
  {
    full_name: 'Amina Jibril',
    email: 'amina.tailor@example.com',
    specialty: "Women's Corporate",
    skills: "Women's Corporate, Ankara Skirt-Suit, Hijab Fashion, Office Wear",
    bio: "Creates stunning women's professional wear — Ankara skirt-suits and hijab-inclusive designs.",
    phone: '0803 000 0005',
    location: 'Keffi, Nasarawa State',
    design: {
      title: 'Ankara Occasion Wear', category: 'Corporate', price: '58000', image: 'amina.jpg',
      description: 'A tailored Ankara occasion outfit for the modern professional woman.',
    },
  },
  {
    full_name: 'Emeka Nwosu',
    email: 'emeka.tailor@example.com',
    specialty: 'Adire & Print Expert',
    skills: 'Adire, Batik Prints, Iro & Buba, Contemporary',
    bio: 'Pioneering Adire dyeing and contemporary print fashion merging Yoruba and Igbo textile traditions.',
    phone: '0803 000 0006',
    location: 'Lafia, Nasarawa State',
    design: {
      title: 'Contemporary Print Set', category: 'Traditional', price: '42000', image: 'emeka.jpg',
      description: 'A contemporary print ensemble blending Yoruba and Igbo textile traditions.',
    },
  },
];

let created = 0;
let skipped = 0;

for (const t of tailors) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(t.email);
  if (existing) {
    skipped++;
    console.log(`skip (already exists): ${t.full_name}`);
    continue;
  }

  const { hash, salt } = hashPassword(SEED_PASSWORD);
  const info = db.prepare(
    'INSERT INTO users (role, full_name, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
  ).run('tailor', t.full_name, t.email, hash, salt);
  const userId = info.lastInsertRowid;

  db.prepare(
    'INSERT INTO tailor_profiles (user_id, bio, specialty, skills, phone, location) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, t.bio, t.specialty, t.skills, t.phone, t.location);

  const d = t.design;
  db.prepare(
    'INSERT INTO designs (tailor_id, title, description, category, price, image_path) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, d.title, d.description, d.category, d.price, `/img/tailors/${d.image}`);

  created++;
  console.log(`created: ${t.full_name} (${t.email}) — password: ${SEED_PASSWORD}`);
}

console.log(`\nDone. ${created} tailor(s) created, ${skipped} skipped (already existed).`);
