const ALWAYS_BLOCK = new Set([
  'privacy', 'terms', 'tos', 'legal', 'cookie', 'cookies', 'gdpr', 'ccpa',
  'disclaimer', 'impressum', 'accessibility', 'compliance',
  'contact', 'support',
  'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'logout',
  'account', 'my-account', 'reset-password', 'forgot-password',
  'cart', 'checkout', 'basket',
  'search', 'sitemap', 'thank-you', 'thanks', '404', 'page-not-found', 'unsubscribe',
]);
const ALWAYS_BLOCK_PREFIXES = [
  'privacy-', 'terms-', 'cookie-', 'legal-', 'login-', 'signup-', 'sign-up-', 'sign-in-',
  'keep-your-account', 'how-to-keep-your', 'data-security',
];

const LISTING_LAST_SEGMENTS = new Set([
  'all', 'index', 'archive', 'archives', 'overview',
  'articles', 'resources', 'posts',
  'resource-center', 'resource', 'blog', 'guides', 'insights',
  'infographics', 'infographic', 'videos', 'video',
  'webinars', 'webinar', 'podcasts', 'podcast',
  'ebooks', 'ebook', 'whitepapers', 'whitepaper',
  'templates', 'checklists', 'checklist',
  'testimonials', 'testimonial', 'reviews', 'review',
  'events', 'case-studies',
]);

const SECTION_BLOCK = new Set([
  'about', 'faq', 'faqs', 'help',
  'company', 'newsroom', 'news', 'press', 'media', 'investors', 'investor-relations',
  'leadership', 'team', 'board', 'executive',
  'who-we-serve', 'who-we-help', 'industries', 'industry', 'customers',
  'use-cases', 'solutions-overview', 'services-support', 'services',
  'career', 'careers', 'jobs', 'job', 'hiring', 'hire', 'vacancies', 'vacancy',
  'internship', 'internships', 'apply', 'application', 'positions', 'openings',
  'open-positions', 'open-roles', 'roles', 'work-with-us', 'work-here',
  'join-us', 'join-our-team', 'join-the-team', 'we-are-hiring', 'talent',
  'partners', 'partner', 'affiliate', 'affiliates', 'newsletter',
]);
const SECTION_BLOCK_PREFIXES = [
  'career-', 'careers-', 'jobs-', 'job-', 'hiring-', 'internship-', 'apply-',
  'open-position', 'open-role', 'about-', 'contact-', 'news-',
];

function isUtilityPage(url) {
  try {
    const segments = new URL(url).pathname.toLowerCase().split('/').filter(Boolean);
    if (segments.some(seg =>
      ALWAYS_BLOCK.has(seg) || ALWAYS_BLOCK_PREFIXES.some(p => seg.startsWith(p))
    )) return true;
    if (segments.slice(0, 2).some(seg =>
      SECTION_BLOCK.has(seg) || SECTION_BLOCK_PREFIXES.some(p => seg.startsWith(p))
    )) return true;
    const last = segments[segments.length - 1];
    return !!last && LISTING_LAST_SEGMENTS.has(last);
  } catch {
    return false;
  }
}

module.exports = { isUtilityPage };
