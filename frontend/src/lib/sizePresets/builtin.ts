import type { PresetTree } from './catalogue'

/**
 * The built-in size presets, offered until (or if) `/size-presets/` cannot be loaded. The part of
 * `backend/data/size_presets.json` the app needs before then: the sizes it used to hard-code, which links,
 * designs and templates name. The server's catalogue adds the rest; a test keeps the rows equal.
 */
export const BUILTIN_PRESET_TREE: PresetTree = {
  version: 1,
  groups: [
    {
      slug: 'presentation',
      label: 'Presentations',
      icon: 'presentation',
      children: [
        {
          slug: 'presentation-screen-slides',
          label: 'Screen slides',
          presets: [
            {
              slug: 'presentation',
              label: 'Presentation (16:9)',
              width: 1920,
              height: 1080,
              unit: 'px',
              icon: 'presentation',
              tags: ['16:9'],
              is_quick: true,
            },
            {
              slug: 'presentation-4-3',
              label: 'Presentation (4:3)',
              width: 1024,
              height: 768,
              unit: 'px',
              icon: 'presentation',
              tags: ['4:3'],
            },
          ],
        },
      ],
    },
    {
      slug: 'print',
      label: 'Print',
      icon: 'printer',
      children: [
        {
          slug: 'paper',
          label: 'Paper',
          children: [
            {
              slug: 'paper-iso-paper-a-b',
              label: 'ISO paper (A & B)',
              presets: [
                {
                  slug: 'a4',
                  label: 'A4 Document',
                  width: 210,
                  height: 297,
                  unit: 'mm',
                  icon: 'file-text',
                  is_quick: true,
                  tags: ['1:1.414'],
                  meta: {
                    bleed: '3 mm',
                  },
                },
                {
                  slug: 'a5',
                  label: 'A5',
                  width: 148,
                  height: 210,
                  unit: 'mm',
                  icon: 'file-text',
                  tags: ['1:1.414'],
                  meta: {
                    bleed: '3 mm',
                  },
                },
                {
                  slug: 'a3',
                  label: 'A3',
                  width: 297,
                  height: 420,
                  unit: 'mm',
                  icon: 'file-text',
                  tags: ['1:1.414'],
                  meta: {
                    bleed: '3 mm',
                  },
                },
              ],
            },
            {
              slug: 'paper-north-american-paper',
              label: 'North American paper',
              presets: [
                {
                  slug: 'letter',
                  label: 'US Letter',
                  width: 8.5,
                  height: 11,
                  unit: 'in',
                  icon: 'file-text',
                  tags: ['1:1.294'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
          ],
        },
        {
          slug: 'cards',
          label: 'Cards and stationery',
          children: [
            {
              slug: 'cards-business-cards',
              label: 'Business cards',
              presets: [
                {
                  slug: 'business-card',
                  label: 'Business Card (3.5 × 2 in)',
                  width: 3.5,
                  height: 2,
                  unit: 'in',
                  icon: 'credit-card',
                  tags: ['1.75:1'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
            {
              slug: 'cards-postcards-and-flat-cards',
              label: 'Postcards and flat cards',
              presets: [
                {
                  slug: 'postcard',
                  label: 'Postcard (6 × 4 in)',
                  width: 6,
                  height: 4,
                  unit: 'in',
                  icon: 'mail',
                  tags: ['1:1.5'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
            {
              slug: 'cards-greeting-cards-invitations-and-thank-you',
              label: 'Greeting cards, invitations and thank-you cards',
              presets: [
                {
                  slug: 'greeting-card',
                  label: 'Greeting Card (4.25 × 5.5 in)',
                  width: 4.25,
                  height: 5.5,
                  unit: 'in',
                  icon: 'mail',
                  tags: ['1:1.294'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
                {
                  slug: 'invitation',
                  label: 'Invitation (5 × 7 in)',
                  width: 5,
                  height: 7,
                  unit: 'in',
                  icon: 'party-popper',
                  tags: ['1:1.4'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
          ],
        },
        {
          slug: 'posters-flyers',
          label: 'Flyers, posters and banners',
          children: [
            {
              slug: 'posters-flyers-and-leaflets',
              label: 'Flyers and leaflets',
              presets: [
                {
                  slug: 'flyer',
                  label: 'Flyer (5.5 × 8.5 in)',
                  width: 5.5,
                  height: 8.5,
                  unit: 'in',
                  icon: 'newspaper',
                  tags: ['1:1.545'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
            {
              slug: 'posters-brochures-and-menus',
              label: 'Brochures and menus',
              presets: [
                {
                  slug: 'brochure',
                  label: 'Brochure (11 × 8.5 in)',
                  width: 11,
                  height: 8.5,
                  unit: 'in',
                  icon: 'newspaper',
                  tags: ['1.294:1'],
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
            {
              slug: 'posters-posters',
              label: 'Posters',
              presets: [
                {
                  slug: 'poster',
                  label: 'Poster (18 × 24 in)',
                  width: 18,
                  height: 24,
                  unit: 'in',
                  icon: 'printer',
                  tags: ['3:4'],
                  is_quick: true,
                  meta: {
                    bleed: '0.125 in',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: 'documents',
      label: 'Documents',
      icon: 'file-text',
      children: [
        {
          slug: 'documents-letters-resumes-business-docs',
          label: 'Letters, resumes & business docs',
          presets: [
            {
              slug: 'letterhead',
              label: 'Letterhead',
              width: 8.5,
              height: 11,
              unit: 'in',
              icon: 'file-text',
            },
            {
              slug: 'resume',
              label: 'Resume',
              width: 210,
              height: 297,
              unit: 'mm',
              icon: 'briefcase',
              tags: ['1:1.414'],
            },
          ],
        },
      ],
    },
    {
      slug: 'video',
      label: 'Video and screens',
      icon: 'monitor',
      children: [
        {
          slug: 'screens-video',
          label: 'Video',
          presets: [
            {
              slug: 'video-1080p',
              label: 'Video (1080p)',
              width: 1920,
              height: 1080,
              unit: 'px',
              icon: 'monitor',
              tags: ['16:9'],
            },
            {
              slug: 'video-4k',
              label: 'Video (4K)',
              width: 3840,
              height: 2160,
              unit: 'px',
              icon: 'monitor',
              tags: ['16:9'],
            },
          ],
        },
      ],
    },
    {
      slug: 'web',
      label: 'Web and email',
      icon: 'globe',
      presets: [
        {
          slug: 'web-banner',
          label: 'Web Banner (728 × 90)',
          width: 728,
          height: 90,
          unit: 'px',
          icon: 'rectangle-horizontal',
        },
      ],
    },
    {
      slug: 'etc',
      label: 'Logos and icons',
      icon: 'badge',
      children: [
        {
          slug: 'logos-logo-canvases',
          label: 'Logo canvases',
          presets: [
            {
              slug: 'logo',
              label: 'Logo (512 × 512)',
              width: 512,
              height: 512,
              unit: 'px',
              icon: 'square',
              tags: ['1:1'],
              is_quick: true,
            },
          ],
        },
      ],
    },
    {
      slug: 'social',
      label: 'Social media',
      icon: 'share-2',
      children: [
        {
          slug: 'facebook',
          label: 'Facebook',
          presets: [
            {
              slug: 'facebook-post',
              label: 'Facebook Post',
              width: 1200,
              height: 630,
              unit: 'px',
              icon: 'rectangle-horizontal',
              tags: ['1.91:1'],
            },
            {
              slug: 'facebook-cover',
              label: 'Facebook Cover',
              width: 1640,
              height: 924,
              unit: 'px',
              icon: 'image',
              tags: ['16:9'],
            },
          ],
        },
        {
          slug: 'instagram',
          label: 'Instagram',
          presets: [
            {
              slug: 'instagram-portrait',
              label: 'Instagram Portrait Post',
              width: 1080,
              height: 1350,
              unit: 'px',
              icon: 'rectangle-vertical',
              tags: ['4:5'],
            },
            {
              slug: 'instagram-post',
              label: 'Instagram Post',
              width: 1080,
              height: 1080,
              unit: 'px',
              icon: 'square',
              tags: ['1:1'],
              is_quick: true,
            },
            {
              slug: 'instagram-story',
              label: 'Instagram Story',
              width: 1080,
              height: 1920,
              unit: 'px',
              icon: 'clapperboard',
              tags: ['9:16'],
              is_quick: true,
              meta: {
                safe_zone: {
                  top: 0.14,
                  bottom: 0.35,
                  left: 0.06,
                  right: 0.06,
                },
              },
            },
            {
              slug: 'instagram-reel',
              label: 'Instagram Reel',
              width: 1080,
              height: 1920,
              unit: 'px',
              icon: 'clapperboard',
              tags: ['9:16'],
            },
          ],
        },
        {
          slug: 'linkedin',
          label: 'LinkedIn',
          presets: [
            {
              slug: 'linkedin-post',
              label: 'LinkedIn Post',
              width: 1200,
              height: 627,
              unit: 'px',
              icon: 'rectangle-horizontal',
              tags: ['1.91:1'],
            },
            {
              slug: 'linkedin-banner',
              label: 'LinkedIn Banner',
              width: 1584,
              height: 396,
              unit: 'px',
              icon: 'image',
              tags: ['4:1'],
            },
          ],
        },
        {
          slug: 'pinterest',
          label: 'Pinterest',
          presets: [
            {
              slug: 'pinterest-pin',
              label: 'Pinterest Pin',
              width: 1000,
              height: 1500,
              unit: 'px',
              icon: 'rectangle-vertical',
              tags: ['2:3'],
            },
          ],
        },
        {
          slug: 'tiktok',
          label: 'TikTok',
          presets: [
            {
              slug: 'tiktok-video',
              label: 'TikTok Video',
              width: 1080,
              height: 1920,
              unit: 'px',
              icon: 'clapperboard',
              tags: ['9:16'],
              meta: {
                safe_zone: {
                  top: 0.13,
                  bottom: 0.34,
                  left: 0.11,
                  right: 0.28,
                },
              },
            },
          ],
        },
        {
          slug: 'x',
          label: 'X',
          presets: [
            {
              slug: 'x-post',
              label: 'X (Twitter) Post',
              width: 1200,
              height: 675,
              unit: 'px',
              icon: 'rectangle-horizontal',
              tags: ['16:9'],
              aliases: ['twitter-post'],
            },
            {
              slug: 'x-header',
              label: 'X (Twitter) Header',
              width: 1500,
              height: 500,
              unit: 'px',
              icon: 'image',
              tags: ['3:1'],
            },
          ],
        },
        {
          slug: 'youtube',
          label: 'YouTube',
          presets: [
            {
              slug: 'youtube-thumbnail',
              label: 'YouTube Thumbnail',
              width: 1280,
              height: 720,
              unit: 'px',
              icon: 'clapperboard',
              tags: ['16:9'],
              is_quick: true,
            },
            {
              slug: 'youtube-banner',
              label: 'YouTube Banner',
              width: 2560,
              height: 1440,
              unit: 'px',
              icon: 'image',
              tags: ['16:9'],
              meta: {
                safe_zone: {
                  top: 0.353,
                  bottom: 0.353,
                  left: 0.198,
                  right: 0.198,
                },
              },
            },
          ],
        },
      ],
    },
  ],
}
