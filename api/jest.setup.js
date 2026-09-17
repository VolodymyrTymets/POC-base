const dotenv = require('dotenv');
dotenv.config({ path: '.env.test', quiet: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' });
