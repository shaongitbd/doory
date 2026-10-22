# Size preset sources

Where each built-in size preset comes from, checked in October 2026. Standards, official help-center,
ads-guide and developer pages were used first. "Unverified" means no official page gives the size, so it
comes from third-party guides or common practice; "No source recorded" means its source still has to be found.
For Instagram, Facebook, X and Telegram, the sources are listed for the platform as a whole, below its table.

Sizes change. If a platform publishes a new size, edit it in the admin site or import a file (see
[content.md](content.md#size-presets)), and send a pull request for `backend/data/size_presets.json`.

## Social media

### Apple Music

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Album / single / EP cover art | 4000 × 4000 | 1:1 | Organic | [Apple for Artists, Cover art](https://artists.apple.com/support/1120-cover-art) |
| Artist image (also shown on Shazam) | 2400 × 2400 | 1:1 | Organic | [Apple for Artists, Artist image guidelines](https://artists.apple.com/support/88-artist-image-guidelines) |
| Artist logo (artist page, iOS 27) | 3000 × 1200 | 5:2 | Organic | [Apple for Artists, Artist logo guidelines](https://artists.apple.com/support/5606-artist-logo-guidelines) |
| Album motion, square (Mac, iPad, TV) | 3840 × 3840 | 1:1 | Organic | [Apple, Introducing Album Motion on Apple Music](https://help.apple.com/itc/albummotionguide/en.lproj/static.html) |
| Album motion, tall (iPhone, Android) | 2048 × 2732 | 3:4 | Organic | [Apple, Introducing Album Motion on Apple Music](https://help.apple.com/itc/albummotionguide/en.lproj/static.html) |
| Artist page motion, square (iPhone, Android) | 3840 × 3840 | 1:1 | Organic | [Apple, Artist Page Motion guide](https://help.apple.com/itc/artistmotionguide/en.lproj/static.html) |
| Artist page motion, fullscreen 16:9 (Apple TV) | 3840 × 2160 | 16:9 | Organic | [Apple, Artist Page Motion guide](https://help.apple.com/itc/artistmotionguide/en.lproj/static.html) |
| Artist page motion, wide 16:9 (Mac, iPad) | 3840 × 2160 | 16:9 | Organic | [Apple, Artist Page Motion guide](https://help.apple.com/itc/artistmotionguide/en.lproj/static.html) |
| Curator playlist cover art | 3000 × 3000 | 1:1 | Organic | [Apple, Apple Music Curator best practices](https://help.apple.com/itc/musiccuratorbestpractices/en.lproj/static.html) |
| Curator page banner art | 4320 × 1080 | 4:1 | Organic | [Apple, Apple Music Curator best practices](https://help.apple.com/itc/musiccuratorbestpractices/en.lproj/static.html) |
| Curator brand logo | 1080 × 1080 | 1:1 | Organic | [Apple, Apple Music Curator best practices](https://help.apple.com/itc/musiccuratorbestpractices/en.lproj/static.html) |

### Behance

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Project cover | 808 × 632 |  | Organic | [Behance Help: Cover Images (Guide: Project Cover Image)](https://help.behance.net/hc/en-us/articles/204483484-Guide-Project-Cover-Image) |
| Project module, full-bleed image | 1400 × 1050 |  | Organic | [Behance Help: Guide: Full Bleed Images](https://help.behance.net/hc/en-us/articles/204483704-Guide-Full-Bleed-Images), [Behance Help: FAQ: I am running into trouble while uploading content to Behance](https://help.behance.net/hc/en-us/articles/204483474-FAQ-I-am-running-into-trouble-while-uploading-content-to-Behance) |
| Project module, standard image | 1200 × 900 |  | Organic | [Behance Help: Guide: Full Bleed Images](https://help.behance.net/hc/en-us/articles/204483704-Guide-Full-Bleed-Images), [Behance Help: FAQ: I am running into trouble while uploading content to Behance](https://help.behance.net/hc/en-us/articles/204483474-FAQ-I-am-running-into-trouble-while-uploading-content-to-Behance) |
| Project module, uploaded video | 1280 × 720 | 16:9 | Organic | [Behance Help: Guide: Uploading Audio & Video Files](https://help.behance.net/hc/en-us/articles/204483574-Guide-Uploading-Audio-Video-Files) |
| Profile banner | 3200 × 410 | ~7.8:1 | Organic | [Behance Help: profile banner article](https://help.behance.net/hc/en-us/articles/360015540594) |
| Profile picture / avatar | 500 × 500 | 1:1 | Organic | Unverified. [UniLink: How to Use Behance in 2026 (third-party)](https://www.unilink.us/blog/how-to-use-behance-2026) |
| Moodboard cover | 808 × 632 | 101:79 | Organic | Unverified. [Behance Help: Cover Images (Guide: Project Cover Image)](https://help.behance.net/hc/en-us/articles/204483484-Guide-Project-Cover-Image), [UniLink: How to Use Behance in 2026 (third-party)](https://www.unilink.us/blog/how-to-use-behance-2026) |

### Bluesky

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Post image, square | 2000 × 2000 | 1:1 | Organic | [AT Protocol lexicon app.bsky.embed.images](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/images.json), [Bluesky social-app constants (image/video limits, CARD_ASPECT_RATIO) and video compression constants](https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts) |
| Post image, portrait | 1600 × 2000 | 4:5 | Organic | [AT Protocol lexicon app.bsky.embed.images](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/images.json), [Bluesky social-app image and video embed layout](https://github.com/bluesky-social/social-app/blob/main/src/components/images/AutoSizedImage.tsx) |
| Post image, landscape | 2000 × 1125 | 16:9 | Organic | [AT Protocol lexicon app.bsky.embed.images](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/images.json), [Bluesky social-app image and video embed layout](https://github.com/bluesky-social/social-app/blob/main/src/components/images/AutoSizedImage.tsx) |
| Post image, tall | 1125 × 2000 | 9:16 | Organic | [Bluesky social-app image and video embed layout](https://github.com/bluesky-social/social-app/blob/main/src/components/images/AutoSizedImage.tsx) |
| Link card thumbnail (og:image) | 1200 × 630 | 1.91:1 | Organic | [AT Protocol lexicon app.bsky.embed.external](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/external.json), [Bluesky social-app constants (image/video limits, CARD_ASPECT_RATIO) and video compression constants](https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts), [Bluesky social-app link card embed and thumbnail resize](https://github.com/bluesky-social/social-app/blob/main/src/components/Post/Embed/ExternalEmbed/index.tsx) |
| Profile picture | 1000 × 1000 | 1:1 | Organic | [AT Protocol lexicon app.bsky.actor.profile (avatar/banner blobs)](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/actor/profile.json), [Bluesky social-app avatar and banner editors](https://github.com/bluesky-social/social-app/blob/main/src/view/com/util/UserAvatar.tsx) |
| Profile banner | 1500 × 500 | 3:1 | Organic | [AT Protocol lexicon app.bsky.actor.profile (avatar/banner blobs)](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/actor/profile.json), [Bluesky social-app avatar and banner editors](https://github.com/bluesky-social/social-app/blob/main/src/view/com/util/UserAvatar.tsx) |
| Custom feed / list / starter pack avatar | 1000 × 1000 | 1:1 | Organic | [AT Protocol lexicons app.bsky.graph.list and app.bsky.feed.generator](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/graph/list.json) |
| Post video, landscape | 1920 × 1080 | 16:9 | Organic | [AT Protocol lexicon app.bsky.embed.video](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/video.json), [Bluesky social-app constants (image/video limits, CARD_ASPECT_RATIO) and video compression constants](https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts), [Engadget, "Bluesky now supports 10-minute videos" (embeds the @bsky.app announcement)](https://engadget.com/2244638/bluesky-now-supports-10-minute-videos-larger-file-sizes/) |
| Post video, vertical | 1080 × 1920 | 9:16 | Organic | [AT Protocol lexicon app.bsky.embed.video](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/video.json), [Bluesky social-app image and video embed layout](https://github.com/bluesky-social/social-app/blob/main/src/components/images/AutoSizedImage.tsx) |
| Post video, square | 1080 × 1080 | 1:1 | Organic | [AT Protocol lexicon app.bsky.embed.video](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/video.json), [Bluesky social-app image and video embed layout](https://github.com/bluesky-social/social-app/blob/main/src/components/images/AutoSizedImage.tsx) |

### Buy Me a Coffee

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Page cover image | 1600 × 400 | 4:1 | Organic | [How to set up your Buy Me a Coffee page?](https://help.buymeacoffee.com/en/articles/10184401-how-to-set-up-your-buy-me-a-coffee-page) |
| Profile picture | 1080 × 1080 | 1:1 | Organic | Unverified. [How to set up your Buy Me a Coffee page?](https://help.buymeacoffee.com/en/articles/10184401-how-to-set-up-your-buy-me-a-coffee-page), [Public creator page (avatar CDN URL served at @300w)](https://buymeacoffee.com/paraphernalia) |
| Shop / Extras featured image | 1080 × 1080 | 1:1 | Organic | [A complete guide on Buy Me a Coffee Shop](https://help.buymeacoffee.com/en/articles/9905719-a-complete-guide-on-buy-me-a-coffee-shop) |
| Membership level image | 1080 × 1080 | 1:1 | Organic | Unverified. [A simple guide to get started with memberships](https://help.buymeacoffee.com/en/articles/9969554-a-simple-guide-to-get-started-with-memberships) |
| Post image (album) | 1080 × 1080 | 1:1 | Organic | Unverified. [Create and publish your first post](https://help.buymeacoffee.com/en/articles/4371724-create-and-publish-your-first-post) |
| Gallery image | 1080 × 1080 | 1:1 | Organic | Unverified. [How to add an image to your gallery?](https://help.buymeacoffee.com/en/articles/6696997-how-to-add-an-image-to-your-gallery) |

### DeviantArt

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile avatar | 100 × 100 | 1:1 | Organic | [How do I change my avatar? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/how-do-i-upload-my-avatar) |
| Profile cover image | 1920 × 1080 | 16:9 | Organic | [How do I change my profile cover image? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/how-do-i-change-my-profile-cover-image), [A Beginner's Guide to Customizing Your Profile (Team, 2024-05-06)](https://www.deviantart.com/team/journal/A-Beginner-s-Guide-to-Customizing-Your-Profile-1042400247) |
| Profile cover image (minimum) | 1600 × 800 | 2:1 | Organic | [How do I change my profile cover image? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/how-do-i-change-my-profile-cover-image) |
| Profile skin (static background) | 1920 × 1080 | 16:9 | Organic | [A Beginner's Guide to Customizing Your Profile (Team, 2024-05-06)](https://www.deviantart.com/team/journal/A-Beginner-s-Guide-to-Customizing-Your-Profile-1042400247) |
| Custom section, top area, 1 column (single graphic) | 1852 × 1042 | 16:9 | Organic | [Advanced guide for profile or group customization (Team, 2025-09-24)](https://www.deviantart.com/team/journal/Advanced-guide-for-profile-or-group-customization-1244396013) |
| Custom section, top area, centre graphic | 1280 × 1090 | 128:109 | Organic | [Advanced guide for profile or group customization (Team, 2025-09-24)](https://www.deviantart.com/team/journal/Advanced-guide-for-profile-or-group-customization-1244396013) |
| Custom section, button graphic | 322 × 193 | 5:3 | Organic | [Advanced guide for profile or group customization (Team, 2025-09-24)](https://www.deviantart.com/team/journal/Advanced-guide-for-profile-or-group-customization-1244396013) |
| Custom section, top area, 2-column split | 480 × 270 | 16:9 | Organic | [Advanced guide for profile or group customization (Team, 2025-09-24)](https://www.deviantart.com/team/journal/Advanced-guide-for-profile-or-group-customization-1244396013) |
| Custom section, top area, 3-column split | 315 × 177 | 16:9 | Organic | [Advanced guide for profile or group customization (Team, 2025-09-24)](https://www.deviantart.com/team/journal/Advanced-guide-for-profile-or-group-customization-1244396013) |
| Film deviation | 1920 × 1080 | 16:9 | Organic | [What file types can I submit to DeviantArt? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/what-file-types-can-i-submit-to-deviantart) |
| Film deviation preview image | 1920 × 1080 | 16:9 | Organic | [What file types can I submit to DeviantArt? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/what-file-types-can-i-submit-to-deviantart), [How do I submit a film? – DeviantArt Help Center](https://www.deviantartsupport.com/kb/en/article/how-do-i-submit-a-film) |
| Shop hero banner (desktop) | 1552 × 450 | 97:28 | Organic | [Be the Shop Hero! (Team, 2023-01-19)](https://www.deviantart.com/team/journal/Be-the-Shop-Hero-945251337) |
| Shop hero banner (mobile) | 375 × 430 | 75:86 | Organic | [Be the Shop Hero! (Team, 2023-01-19)](https://www.deviantart.com/team/journal/Be-the-Shop-Hero-945251337) |

### Discord

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Server icon | 512 × 512 | 1:1 | Organic | [How do I create a server? (Discord Help Center)](https://support.discord.com/hc/en-us/articles/204849977-How-do-I-create-a-server) |
| Server banner (channel list header) | 960 × 540 | 16:9 | Organic | [Server Banners (Discord Help Center)](https://support.discord.com/hc/en-us/articles/360028716472-Server-Banners) |
| Server banner, 2× | 1920 × 1080 | 16:9 | Organic | [Server Banners (Discord Help Center)](https://support.discord.com/hc/en-us/articles/360028716472-Server-Banners) |
| Server invite background | 1920 × 1080 | 16:9 | Organic | [Server Invite Background (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4415841146391-Server-Invite-Background) |
| Server Discovery listing cover | 1920 × 1080 | 16:9 | Organic | Unverified. [Discord Size Guide (Whop blog, third-party)](https://whop.com/blog/discord-size-guide/) |
| Scheduled event cover | 800 × 400 | 2:1 | Organic | Unverified. [Event Cover image resolution recommendation is wrong (Discord Help Center community post quoting the in-app hint)](https://support.discord.com/hc/en-us/community/posts/5237994343447-Event-Cover-image-resolution-recommendation-is-wrong) |
| Profile avatar | 512 × 512 | 1:1 | Organic | Unverified. [Custom Profiles (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles), [Discord Image & Video Specs (Media Cheat Sheet, third-party)](https://mediacheatsheet.com/platform/discord) |
| Profile banner | 680 × 240 | 17:6 | Organic | [Custom Profiles (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles) |
| Profile banner, 2× | 1360 × 480 | 17:6 | Organic | [Custom Profiles (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles) |
| Custom emoji | 128 × 128 | 1:1 | Organic | Unverified. [How to Add Custom Emojis on Discord (Discord Help Center)](https://support.discord.com/hc/en-us/articles/360036479811-How-to-Add-Custom-Emojis-on-Discord) |
| Custom sticker | 320 × 320 | 1:1 | Organic | [Tips for Sticker Creators FAQ (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4402687377815) |
| Role icon | 64 × 64 | 1:1 | Organic | [Custom Role Icons FAQ (Discord Help Center)](https://support.discord.com/hc/en-us/articles/4409571023639-Custom-Role-Icons-FAQ) |
| App Rich Presence art asset | 1024 × 1024 | 1:1 | Organic | [Setting a User's Rich Presence (Discord Developer Docs)](https://docs.discord.com/developers/rich-presence/using-with-the-embedded-app-sdk) |

### Dribbble

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Shot (standard 4:3) | 1600 × 1200 | 4:3 | Organic | [Creating Dribbble Shots (Dribbble Help Center)](https://help.dribbble.com/en/articles/11062601-creating-dribbble-shots) |
| Shot (widescreen) | 1920 × 1080 | 16:9 | Organic | Unverified. [Creating Dribbble Shots (Dribbble Help Center)](https://help.dribbble.com/en/articles/11062601-creating-dribbble-shots), [Dribbble Shot Size in 2026 (UniLink blog, third-party)](https://unil.ink/blog/dribbble-shot-size-2026) |
| Shot (square) | 1600 × 1600 | 1:1 | Organic | [Creating Dribbble Shots (Dribbble Help Center)](https://help.dribbble.com/en/articles/11062601-creating-dribbble-shots) |
| Shot thumbnail (feed card) | 1600 × 1200 | 4:3 | Organic | Unverified. [Creating Dribbble Shots (Dribbble Help Center)](https://help.dribbble.com/en/articles/11062601-creating-dribbble-shots), [Dribbble Shot Size in 2026 (UniLink blog, third-party)](https://unil.ink/blog/dribbble-shot-size-2026) |
| Avatar | 800 × 800 | 1:1 | Organic | [Creating & managing your Dribbble profile (Dribbble Help Center)](https://help.dribbble.com/en/articles/11056066-creating-managing-your-dribbble-profile) |
| Profile masthead (Pro only) | 1600 × 1200 | 4:3 | Organic | [Creating & managing your Dribbble profile (Dribbble Help Center)](https://help.dribbble.com/en/articles/11056066-creating-managing-your-dribbble-profile) |

### Eventbrite

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Event main (cover) image | 2160 × 1080 | 2:1 | Organic | [Add images and video to your event (Eventbrite Help Center)](https://www.eventbrite.com/help/en-us/articles/682424/how-to-choose-a-great-event-image/) |
| Event carousel image (additional) | 2160 × 1080 | 2:1 | Organic | [Add images and video to your event (Eventbrite Help Center)](https://www.eventbrite.com/help/en-us/articles/682424/how-to-choose-a-great-event-image/) |
| Organizer profile image (logo) | 400 × 400 | 1:1 | Organic | [Create and manage your organizer profile (Eventbrite Help Center)](https://www.eventbrite.com/help/en-us/articles/161196/how-to-set-up-your-organizer-profile-page/) |
| Organizer profile cover (banner) | 2160 × 1080 | 2:1 | Organic | Unverified. [Create and manage your organizer profile (Eventbrite Help Center)](https://www.eventbrite.com/help/en-us/articles/161196/how-to-set-up-your-organizer-profile-page/) |
| Eventbrite Ads (promoted listing) | 2160 × 1080 | 2:1 | Ad | [Eventbrite Ads (Eventbrite organizer features page)](https://www.eventbrite.com/organizer/features/eventbrite-ads/), [Eventbrite Ads: How to Showcase Your Event Listings on Eventbrite (Eventbrite blog)](https://www.eventbrite.com/blog/asset/introducing-eventbrite-ads/) |

### Facebook

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed / Album | 1080 × 1350 | 4:5 | Organic | see sources below |
| Feed | 1080 × 1080 | 1:1 | Organic | see sources below |
| Link preview (OG) | 1200 × 630 | 1.91:1 | Organic | see sources below |
| Stories / Reels | 1080 × 1920 | 9:16 | Organic | see sources below |
| Video | 1920 × 1080 | 16:9 | Organic | see sources below |
| Page profile | 320 × 320 | 1:1 | Organic | see sources below |
| Page cover | 1640 × 924 | 16:9 | Organic | see sources below |
| Event | 1920 × 1005 | 1.91:1 | Organic | see sources below |

Sources:

- [Facebook Help: background colors (not on Pages)](https://www.facebook.com/help/1824001514537829)
- [Facebook Help: photos and videos (15 MB, formats, albums)](https://www.facebook.com/help/121317464722113)
- [Meta Newsroom: making it easier to create videos (all videos become Reels)](https://about.fb.com/news/2025/06/making-it-easier-create-videos-facebook/)
- [Meta Business Help: requirements for Facebook Reels](https://www.facebook.com/business/help/1197310377458196)
- [Meta for Developers: Reels Publishing API](https://developers.facebook.com/docs/video-api/guides/reels-publishing)
- [Meta for Developers: Page Stories API](https://developers.facebook.com/documentation/video-api/page-stories-api)
- [Meta Business Help: Stories specs](https://www.facebook.com/business/help/292794301336717)
- [Facebook Help: Live video](https://www.facebook.com/help/1534561009906955)
- [TechCrunch: Facebook tests link-posting limit](https://techcrunch.com/2025/12/17/facebook-is-testing-a-link-posting-limit-for-professional-accounts-and-pages/)
- [Social Media Today: Facebook Pages get charged for link posts](https://www.socialmediatoday.com/news/facebook-pages-get-charged-for-link-posts/830743/)
- [Meta Business Help: link preview editing / link ownership](https://www.facebook.com/business/help/1954174664835417)
- [Meta Business Help: collaborators on posts](https://www.facebook.com/business/help/703378877328275)
- [More In Store: Facebook carousel (organic vs ads)](https://www.moreinstore.ca/marketing-moxie-blog/the-facebook-carousel-how-to-set-one-up-and-why-theyre-effective)
- [Sprinklr: Meta deprecated organic carousel publishing](https://www.sprinklr.com/help/articles/getting-started-facebook/facebook-channel-updates/63ec8cd6f6e2cc7d18fa540e)
- [Meta Business Help: scheduling posts (20 min to 29 days)](https://www.facebook.com/business/help/1252240869631062)
- [Meta for Business: introducing Meta One plans for businesses](https://www.facebook.com/business/news/introducing-meta-one-plans-for-businesses)
- [OWOX: all Facebook photo sizes](https://www.owox.com/blog/articles/all-facebook-photo-sizes)
- [Meta Ads Guide: video specs (reference for length and size)](https://www.facebook.com/business/ads-guide/update/video)
- [Facebook Help: Page profile picture size](https://www.facebook.com/help/125379114252045)
- [Facebook Help: Page cover photo](https://www.facebook.com/help/1910675759253872)

### Flickr

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile photo (buddy icon) | 512 × 512 | 1:1 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html), [Change your Flickr profile photo – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404078386324-Change-your-profile-photo) |
| Profile cover photo | 2048 × 768 | 8:3 | Organic | Unverified. [Change your Flickr cover photo – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404070398228), [Cover Photo - banner size? – Flickr Help Forum](https://www.flickr.com/help/forum/en-us/72157669059834780), [Optimizing the cover image – Flickr Help Forum](https://www.flickr.com/help/forum/en-us/72157634943422426) |
| Group cover photo | 2048 × 768 | 8:3 | Organic | Unverified. [Change your Flickr cover photo – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404070398228), [Cover Photo - banner size? – Flickr Help Forum](https://www.flickr.com/help/forum/en-us/72157669059834780) |
| Album cover (primary photo) | 2048 × 1365 | 3:2 | Organic | Unverified. [Change the cover photo of an album – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404078540052-Change-the-cover-photo-of-an-album), [Repositioning of Albums Cover/Banner Photo – Flickr Help Forum](https://www.flickr.com/help/forum/en-us/72157719023627559) |
| Photo upload, 2K display | 2048 × 1365 | 3:2 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html), [Flickr upload requirements – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404079649300), [Introducing two new photo sizes and a new setting for Pro members – Flickr Blog](https://blog.flickr.net/en/2012/05/03/introducing-two-new-photo-sizes-and-a-new-setting-for-pro-members/) |
| Photo upload, 2K portrait | 1365 × 2048 | 2:3 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html), [Flickr upload requirements – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404079649300) |
| Photo upload, square | 2048 × 2048 | 1:1 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html) |
| Photo upload, Pro 6K display | 6144 × 4096 | 3:2 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html), [Flickr Triples Display Size of Pro Photos to 6K – PetaPixel](https://petapixel.com/2019/10/19/flickr-triples-display-size-of-pro-photos-to-6k/) |
| Photo upload, 2:1 panorama | 4096 × 2048 | 2:1 | Organic | [Photo Image URLs (size suffixes) – Flickr API docs](https://www.flickr.com/services/api/misc.urls.html) |
| Video upload | 1920 × 1080 | 16:9 | Organic | [Flickr upload requirements – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404079649300) |
| Video upload, vertical | 1080 × 1920 | 9:16 | Organic | [Flickr upload requirements – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404079649300) |

### GitHub

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Repository social preview | 1280 × 640 | 2:1 | Organic | [Customizing your repository's social media preview (GitHub Docs)](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) |
| Repository social preview (minimum) | 640 × 320 | 2:1 | Organic | [Customizing your repository's social media preview (GitHub Docs)](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) |
| Profile picture (personal account) | 500 × 500 | 1:1 | Organic | [Profile reference (GitHub Docs)](https://docs.github.com/en/account-and-profile/reference/profile-reference) |
| Organization profile picture | 500 × 500 | 1:1 | Organic | Unverified. [Profile reference (GitHub Docs)](https://docs.github.com/en/account-and-profile/reference/profile-reference) |
| README banner (common practice) | 1280 × 640 | 2:1 | Organic | Unverified. [How to generate social images for GitHub repositories (third-party blog)](https://macmyths.com/how-to-generate-social-images-for-github-repositories/) |
| README header strip (common practice) | 1280 × 320 | 4:1 | Organic | Unverified. [How to generate social images for GitHub repositories (third-party blog)](https://macmyths.com/how-to-generate-social-images-for-github-repositories/) |
| Marketplace listing logo | 200 × 200 | 1:1 | Organic | [Writing a listing description for your app (GitHub Docs)](https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app) |
| Marketplace feature card background | 965 × 482 | 2:1 | Organic | [Writing a listing description for your app (GitHub Docs)](https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app) |
| Marketplace product screenshot | 1200 × 675 | 16:9 | Organic | [Writing a listing description for your app (GitHub Docs)](https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app) |
| GitHub App logo (app settings badge) | 200 × 200 | 1:1 | Organic | [Creating a custom badge for your GitHub App (GitHub Docs)](https://docs.github.com/en/enterprise-server@3.19/apps/creating-github-apps/registering-a-github-app/creating-a-custom-badge-for-your-github-app) |

### Google Business Profile

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Cover photo | 1920 × 1080 | 16:9 | Organic | [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en), [Google API client docs, MybusinessV3::Photos (cover, profile and logo rules)](https://googleapis.dev/ruby/google-api-client/v0.23.7/Google/Apis/MybusinessV3/Photos.html) |
| Logo / profile photo | 720 × 720 | 1:1 | Organic | [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en), [Google Business Profile Help: Tips for business-specific photos](https://support.google.com/business/answer/6123536?hl=en), [Google API client docs, MybusinessV3::Photos (cover, profile and logo rules)](https://googleapis.dev/ruby/google-api-client/v0.23.7/Google/Apis/MybusinessV3/Photos.html) |
| Business photo (exterior, interior, team, food, menu) | 720 × 720 | 1:1 | Organic | [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en), [Google Business Profile Help: Tips for business-specific photos](https://support.google.com/business/answer/6123536?hl=en) |
| Business photo, landscape | 1200 × 900 | 4:3 | Organic | Unverified. [Semrush blog: Google Business Profile photo size (third-party, July 2025)](https://www.semrush.com/blog/google-business-profile-photo-size/) |
| Post: update | 1200 × 900 | 4:3 | Organic | Unverified. [Semrush blog: Google Business Profile photo size (third-party, July 2025)](https://www.semrush.com/blog/google-business-profile-photo-size/), [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en) |
| Post: offer | 1200 × 900 | 4:3 | Organic | Unverified. [Semrush blog: Google Business Profile photo size (third-party, July 2025)](https://www.semrush.com/blog/google-business-profile-photo-size/), [Google Business Profile Help: Create & manage posts on your Business Profile](https://support.google.com/business/answer/7342169?hl=en) |
| Post: event | 1200 × 900 | 4:3 | Organic | Unverified. [Semrush blog: Google Business Profile photo size (third-party, July 2025)](https://www.semrush.com/blog/google-business-profile-photo-size/), [Google Business Profile Help: Create & manage posts on your Business Profile](https://support.google.com/business/answer/7342169?hl=en) |
| Product (product editor) | 1200 × 900 | 4:3 | Organic | Unverified. [Semrush blog: Google Business Profile photo size (third-party, July 2025)](https://www.semrush.com/blog/google-business-profile-photo-size/), [Google Business Profile Help: About product editor](https://support.google.com/business/answer/9124203?hl=en) |
| Video (profile or post) | 1920 × 1080 | 16:9 | Organic | [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en), [Google Business Profile Help: Create & manage posts on your Business Profile](https://support.google.com/business/answer/7342169?hl=en) |
| Video, vertical | 1080 × 1920 | 9:16 | Organic | Unverified. [Google Business Profile Help: Manage your Business Profile photos & videos](https://support.google.com/business/answer/6103862?hl=en) |

### Indiegogo

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Project thumbnail (campaign card in lists) | 700 × 700 | 1:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Project page cover image | 1743 × 498 | 7:2 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Social media share image | 1200 × 630 | 1.91:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Project gallery image (top of page) | 1200 × 630 | 1.91:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Project gallery video thumbnail | 1200 × 630 | 1.91:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Story / detailed description image | 1200 × 675 | 16:9 | Organic | [Project detailed description (Indiegogo Help Center)](https://help.indiegogo.com/article/483-project-detailed-description) |
| Story / description animation | 1200 × 675 | 16:9 | Organic | [Project detailed description (Indiegogo Help Center)](https://help.indiegogo.com/article/483-project-detailed-description) |
| Reward / add-on (perk) product gallery | 700 × 700 | 1:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Update front image | 700 × 700 | 1:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Launch email image | 700 × 700 | 1:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Creator avatar | 700 × 700 | 1:1 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |
| Creator home page cover slideshow | 1743 × 498 | 7:2 | Organic | [Project image descriptions (Indiegogo Help Center)](https://help.indiegogo.com/article/503-project-image-descriptions) |

### Instagram

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed / Carousel | 1080 × 1350 | 4:5 | Organic | see sources below |
| Feed | 1080 × 1440 | 3:4 | Organic | see sources below |
| Feed | 1080 × 1080 | 1:1 | Organic | see sources below |
| Feed | 1080 × 566 | 1.91:1 | Organic | see sources below |
| Story | 1080 × 1920 | 9:16 | Organic | see sources below |
| Reel | 1080 × 1920 | 9:16 | Organic | see sources below |
| Profile | 320 × 320 | 1:1 | Organic | see sources below |

Sources:

- [Instagram Help: Reels video specs (30 fps, 720p)](https://help.instagram.com/1038071743007909)
- [Meta for Developers: IG User Media (API limits)](https://developers.facebook.com/docs/instagram-api/reference/ig-user/media)
- [Instagram Help: photo resolution and aspect ratios](https://help.instagram.com/1631821640426723)

### KakaoTalk

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Channel profile image | 640 × 640 | 1:1 | Organic | [Kakao Business Guide, 채널홈 설정 (Channel home settings)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/profile) |
| Channel brand card (landscape) | 1280 × 720 | 16:9 | Organic | [Kakao Business Guide, 채널홈 설정 (Channel home settings)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/profile) |
| Channel brand card (square) | 1080 × 1080 | 1:1 | Organic | [Kakao Business Guide, 채널홈 설정 (Channel home settings)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/profile) |
| Channel brand card (portrait) | 1080 × 1440 | 3:4 | Organic | [Kakao Business Guide, 채널홈 설정 (Channel home settings)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/profile) |
| Channel post, card view (square) | 1080 × 1080 | 1:1 | Organic | [Kakao Business Guide, 소식 작성 (Writing channel posts)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/post) |
| Channel post, card view (vertical) | 1080 × 1440 | 3:4 | Organic | [Kakao Business Guide, 소식 작성 (Writing channel posts)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/post) |
| Channel post photo (widest uncropped) | 1080 × 540 | 2:1 | Organic | [Kakao Business Guide, 소식 작성 (Writing channel posts)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/post) |
| Channel post photo (tallest uncropped) | 1080 × 1404 | 1:1.3 | Organic | [Kakao Business Guide, 소식 작성 (Writing channel posts)](https://kakaobusiness.gitbook.io/main/partner/smb/channel/step1/post) |
| Channel message, wide image | 800 × 600 | 4:3 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, wide list item 1 | 800 × 400 | 2:1 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, wide list items 2–5 | 800 × 800 | 1:1 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, basic text with image | 800 × 400 | 2:1 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, carousel feed slide | 800 × 600 | 4:3 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, carousel commerce / catalog item | 800 × 800 | 1:1 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, spotlight | 800 × 600 | 4:3 | Ad | [Kakao Business Guide, 메시지 (Channel messages)](https://kakaobusiness.gitbook.io/main/channel/run/message) |
| Channel message, quiz image | 800 × 400 | 2:1 | Ad | [Kakao Business Guide, 메시지 (Channel messages)](https://kakaobusiness.gitbook.io/main/channel/run/message) |
| Channel message, premium video | 1080 × 1440 | 3:4 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Channel message, premium video thumbnail | 600 × 800 | 3:4 | Ad | [Kakao Business Guide, 채널 메시지 제작 가이드 (Channel message production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/messagead/channelmessage/content-guide) |
| Emoticon proposal, static | 360 × 360 | 1:1 | Organic | Unverified. [Soomgo, 이모티콘 제작 가이드 Q&A (emoticon production guide Q&A, third party)](https://soomgo.com/questions/3402), [Kakao Corp, 이모티콘 스튜디오 전면 개편 (Emoticon Studio revamp, 2025-11-26)](https://www.kakaocorp.com/page/detail/11821) |
| Emoticon proposal, animated | 360 × 360 | 1:1 | Organic | Unverified. [Soomgo, 이모티콘 제작 가이드 Q&A (emoticon production guide Q&A, third party)](https://soomgo.com/questions/3402), [Kakao Corp, 이모티콘 스튜디오 전면 개편 (Emoticon Studio revamp, 2025-11-26)](https://www.kakaocorp.com/page/detail/11821) |
| Emoticon proposal, big (square) | 540 × 540 | 1:1 | Organic | Unverified. [Soomgo, 이모티콘 제작 가이드 Q&A (emoticon production guide Q&A, third party)](https://soomgo.com/questions/3402), [Kakao Corp, 이모티콘 스튜디오 전면 개편 (Emoticon Studio revamp, 2025-11-26)](https://www.kakaocorp.com/page/detail/11821) |
| Emoticon proposal, big (wide) | 540 × 300 | 9:5 | Organic | Unverified. [Soomgo, 이모티콘 제작 가이드 Q&A (emoticon production guide Q&A, third party)](https://soomgo.com/questions/3402), [Kakao Corp, 이모티콘 스튜디오 전면 개편 (Emoticon Studio revamp, 2025-11-26)](https://www.kakaocorp.com/page/detail/11821) |
| Emoticon proposal, big (tall) | 300 × 540 | 5:9 | Organic | Unverified. [Soomgo, 이모티콘 제작 가이드 Q&A (emoticon production guide Q&A, third party)](https://soomgo.com/questions/3402), [Kakao Corp, 이모티콘 스튜디오 전면 개편 (Emoticon Studio revamp, 2025-11-26)](https://www.kakaocorp.com/page/detail/11821) |
| Brand emoticon, emote | 360 × 360 | 1:1 | Ad | [Kakao Business Guide, 브랜드이모티콘 제작가이드 (Brand emoticon production guide)](https://kakaobusiness.gitbook.io/main/ad/other-ad/brandemoticon/undefined) |
| Brand emoticon, keyboard thumbnail | 210 × 210 | 1:1 | Ad | [Kakao Business Guide, 브랜드이모티콘 제작가이드 (Brand emoticon production guide)](https://kakaobusiness.gitbook.io/main/ad/other-ad/brandemoticon/undefined) |
| Brand emoticon, keyboard tab icon | 78 × 78 | 1:1 | Ad | [Kakao Business Guide, 브랜드이모티콘 제작가이드 (Brand emoticon production guide)](https://kakaobusiness.gitbook.io/main/ad/other-ad/brandemoticon/undefined) |
| Brand emoticon, list title | 216 × 216 | 1:1 | Ad | [Kakao Business Guide, 브랜드이모티콘 제작가이드 (Brand emoticon production guide)](https://kakaobusiness.gitbook.io/main/ad/other-ad/brandemoticon/undefined) |
| Brand emoticon, gift/share image | 600 × 800 | 3:4 | Ad | [Kakao Business Guide, 브랜드이모티콘 제작가이드 (Brand emoticon production guide)](https://kakaobusiness.gitbook.io/main/ad/other-ad/brandemoticon/undefined) |
| Kakao Bizboard banner | 960 × 300 | 16:5 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard object asset | 314 × 300 | ~1.05:1 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard thumbnail asset | 320 × 222 | ~1.44:1 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard expandable video | 1280 × 720 | 16:9 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard expandable image | 1200 × 600 | 2:1 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard expandable multi-image | 1080 × 1080 | 1:1 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard ad view, full view (image) | 720 × 1560 | 6:13 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard ad view, full view (video) | 720 × 1560 | 6:13 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard ad view, compact / share bubble | 1280 × 720 | 16:9 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Bizboard ad view, scroll view (image) | 720 × 1560 | 6:13 | Ad | [Kakao Business Guide, 비즈보드 제작 가이드 (Bizboard production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide) |
| Display ad, image native | 1200 × 600 | 2:1 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad), [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide) |
| Display ad, image native | 500 × 500 | 1:1 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad), [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide) |
| Display ad, image native | 720 × 1280 | 9:16 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad), [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide) |
| Display ad, image native | 800 × 1000 | 4:5 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad), [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide) |
| Display ad / profile full view, profile image | 300 × 300 | 1:1 | Ad | [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide), [Kakao Business Guide, 프로필 풀뷰 제작 가이드 (Profile full view production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/guarantee/profilefullview/content-guide) |
| Display ad, slide asset | 500 × 500 | 1:1 | Ad | [Kakao Business Guide, 디스플레이 제작 가이드 (Display production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide) |
| Display ad, video native | 1280 × 720 | 16:9 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad) |
| Display ad, video native | 720 × 1280 | 9:16 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad) |
| Display ad, video native | 1080 × 1080 | 1:1 | Ad | [Kakao Business Guide, 디스플레이 광고 (Display ads)](https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad) |
| Rich Pop All Day, promo image | 1200 × 756 | ~1.59:1 | Ad | [Kakao Business Guide, 리치팝 올데이 제작 가이드 (Rich Pop All Day production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/guarantee/richpop/content-guide) |
| Focus Board background / object / video | 1504 × 336 | ~4.5:1 | Ad | [Kakao Business Guide, 포커스 보드 제작 가이드 (Focus Board production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/guarantee/focusboard/content-guide) |
| Profile full view, background (image) | 720 × 1280 | 9:16 | Ad | [Kakao Business Guide, 프로필 풀뷰 제작 가이드 (Profile full view production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/guarantee/profilefullview/content-guide) |
| Profile full view, background (video) | 1440 × 2560 | 9:16 | Ad | [Kakao Business Guide, 프로필 풀뷰 제작 가이드 (Profile full view production guide)](https://kakaobusiness.gitbook.io/main/ad/moment/guarantee/profilefullview/content-guide) |

### Kick

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile picture (avatar) | 800 × 800 | 1:1 | Organic | Unverified. [Elgato docs: Profile Art (Kick banner min 1280×700, 4 MB)](https://docs.elgato.com/obs/profile-art), [Eklipse: How to set up Kick channel branding](https://blog.eklipse.gg/beginner-guide-2/how-to-setup-kick-channel-branding.html), [Building your channel branding on KICK (Kick Help Center)](https://help.kick.com/en/articles/14994648-building-your-channel-branding-on-kick) |
| Channel banner | 1920 × 1050 | 64:35 | Organic | Unverified. [Elgato docs: Profile Art (Kick banner min 1280×700, 4 MB)](https://docs.elgato.com/obs/profile-art), [Eklipse: How to set up Kick channel branding](https://blog.eklipse.gg/beginner-guide-2/how-to-setup-kick-channel-branding.html), [Building your channel branding on KICK (Kick Help Center)](https://help.kick.com/en/articles/14994648-building-your-channel-branding-on-kick) |
| Offline banner (player, when not live) | 1920 × 1080 | 16:9 | Organic | Unverified. [Eklipse: How to set up Kick channel branding](https://blog.eklipse.gg/beginner-guide-2/how-to-setup-kick-channel-branding.html), [Streamer.Guide: Stream Channel Setup: Panels, Art Sizes, Descriptions](https://streamer.guide/guides/stream-channel-branding-panels-setup) |
| About panel image | 320 × 160 | 2:1 | Organic | Unverified. [Streamer.Guide: Stream Channel Setup: Panels, Art Sizes, Descriptions](https://streamer.guide/guides/stream-channel-branding-panels-setup), [How to add or remove KICK channel panels (Kick Help Center)](https://help.kick.com/en/articles/7109352-how-to-add-or-remove-kick-channel-panels) |
| Channel / subscriber emote | 500 × 500 | 1:1 | Organic | [How to add or edit KICK emotes (Kick Help Center)](https://help.kick.com/en/articles/7113467-how-to-add-or-edit-kick-emotes), [Building your channel branding on KICK (Kick Help Center)](https://help.kick.com/en/articles/14994648-building-your-channel-branding-on-kick) |
| Subscriber badge | 36 × 36 | 1:1 | Organic | Unverified. [Stream-Rise: How to add sub badges on Kick](https://stream-rise.com/blog/how-to-add-sub-badges-on-kick) |
| Stream overlay / canvas (1080p) | 1920 × 1080 | 16:9 | Organic | [How to stream on KICK.com (Kick Help Center)](https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com), [Building your channel branding on KICK (Kick Help Center)](https://help.kick.com/en/articles/14994648-building-your-channel-branding-on-kick) |
| Stream overlay / canvas (720p) | 1280 × 720 | 16:9 | Organic | [Why 1080p may not be available on your channel (Kick Help Center)](https://help.kick.com/en/articles/15638073-why-1080p-may-not-be-available-on-your-channel) |

### Kickstarter

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Project image (main card / hero) | 1024 × 576 | 16:9 | Organic | [How to make a great project image (Kickstarter Help)](https://www.kickstarter.com/help/images) |
| Project video | 1920 × 1080 | 16:9 | Organic | [How do I include images or other media in my project description and updates? (Kickstarter Help)](https://help.kickstarter.com/en-us/articles/16236740-how-do-i-include-images-or-other-media-in-my-project-description-and-updates), [Is a project video required to launch? (Kickstarter Help)](https://help.kickstarter.com/en-us/articles/16236743-is-a-project-video-required-to-launch) |
| Discovery Mode video (mobile app feed) | 1080 × 1920 | 9:16 | Organic | [Is a project video required to launch? (Kickstarter Help)](https://help.kickstarter.com/en-us/articles/16236743-is-a-project-video-required-to-launch), [Mobile Discovery Mode (Kickstarter release notes, 2026-08-26)](https://start.kickstarter.com/kickstarter-release-notes/mobile-discovery-mode) |
| Story / description image | 1400 × 788 | 16:9 | Organic | [How do I include images or other media in my project description and updates? (Kickstarter Help)](https://help.kickstarter.com/en-us/articles/16236740-how-do-i-include-images-or-other-media-in-my-project-description-and-updates) |
| Story / description animated GIF | 700 × 394 | 16:9 | Organic | [How do I include images or other media in my project description and updates? (Kickstarter Help)](https://help.kickstarter.com/en-us/articles/16236740-how-do-i-include-images-or-other-media-in-my-project-description-and-updates) |
| Reward / add-on item image | 1200 × 800 | 3:2 | Organic | [How do I itemize my rewards? (Kickstarter Help)](https://help.kickstarter.com/hc/en-us/articles/25590074600603-How-do-I-itemize-my-rewards), [Images on Rewards Is Now Live! (Kickstarter blog, 2023-03-15)](https://updates.kickstarter.com/images-on-rewards/) |
| Spotlight page main image (after funding) | 700 × 394 | 16:9 | Organic | [How do I customize my Spotlight page? (Kickstarter Help)](https://help.kickstarter.com/hc/en-us/articles/115005139153-How-do-I-customize-my-Spotlight-page) |
| Creator profile avatar | 800 × 800 | 1:1 | Organic | Unverified. [Kickstarter Image Size Guide 2026 (Pixel Image, third-party, 2026-05-04)](https://www.ppimage.com/blog/kickstarter-image-size-guide) |

### Ko-fi

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile picture (avatar) | 800 × 800 | 1:1 | Organic | Unverified. [Ko-fi Profile Picture Size (third-party)](https://postsize.org/kofi/profile-picture-size) |
| Page cover image | 1200 × 400 | 3:1 | Organic | [Make your page stand out with a cover image – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360004243378-Make-your-page-stand-out-with-a-cover-image), [Uploading GIFs on Ko-fi – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360004255998-Uploading-GIFs-on-Ko-fi) |
| Post image (blog/image post) | 600 × 300 | 2:1 | Organic | [Creating posts? Let's make them shine! – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360007638073-Creating-posts-Let-s-make-them-shine) |
| Shop item preview image (square) | 600 × 600 | 1:1 | Organic | [Ko-fi Shop - Sell digital & physical products – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360009712917-Ko-fi-Shop-Sell-digital-physical-products) |
| Shop item preview image (wide) | 600 × 300 | 2:1 | Organic | [Ko-fi Shop - Sell digital & physical products – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360009712917-Ko-fi-Shop-Sell-digital-physical-products) |
| Shop sharing preview image | 1000 × 500 | 2:1 | Organic | [Ko-fi Shop - Sell digital & physical products – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360009712917-Ko-fi-Shop-Sell-digital-physical-products) |
| Membership tier image | 600 × 300 | 2:1 | Organic | [Ko-fi Memberships and Membership Tiers – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/4402945994001-Ko-fi-Memberships-and-Membership-Tiers), [Uploading GIFs on Ko-fi – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360004255998-Uploading-GIFs-on-Ko-fi) |
| Commission preview image (square) | 600 × 600 | 1:1 | Organic | [What are Ko-fi Commissions? – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360016170433-What-are-Ko-fi-Commissions) |
| Commission preview image (wide) | 600 × 300 | 2:1 | Organic | [What are Ko-fi Commissions? – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360016170433-What-are-Ko-fi-Commissions) |
| Page social preview (link share) image | 600 × 300 | 2:1 | Organic | [Change your social preview image and text – Ko-fi Help](https://help.ko-fi.com/hc/en-us/articles/360020081893-Change-your-social-preview-image-and-text) |

### LINE

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Official Account profile image (icon) | 640 × 640 | 1:1 | Organic | Unverified. [LY Corporation for Business, LINE Official Account Manager manual: Business profile](https://www.lycbiz.com/jp/manual/OfficialAccountManager/profile/), [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/) |
| Official Account business profile background (cover) | 2160 × 1080 | 2:1 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Business profile](https://www.lycbiz.com/jp/manual/OfficialAccountManager/profile/) |
| Rich menu, large | 2500 × 1686 | 1.48:1 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Rich menus](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-menus/), [LY Corporation for Business, LINE Official Account Manager manual: Rich messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-messages) |
| Rich menu, small | 2500 × 843 | 2.97:1 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Rich menus](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-menus/), [LY Corporation for Business, LINE Official Account Manager manual: Rich messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-messages) |
| Rich message (square) | 1040 × 1040 | 1:1 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Rich messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-messages), [LINE Developers, Messaging API reference (rich menu image, imagemap, template and coupon images)](https://developers.line.biz/en/reference/messaging-api/) |
| Rich message (landscape) | 1040 × 585 | 16:9 | Organic | Unverified. [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/), [L Message, LINE Official Account image size list (blog)](https://lme.jp/media/line/image-size) |
| Rich message (portrait) | 1040 × 1300 | 4:5 | Organic | Unverified. [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/), [L Message, LINE Official Account image size list (blog)](https://lme.jp/media/line/image-size) |
| Rich video message | 1920 × 1080 | 16:9 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Rich video messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-video-messages/) |
| Rich video message (portrait) | 1080 × 1920 | 9:16 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Rich video messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-video-messages/) |
| Card-based message, product/location card | 770 × 500 | 1.54:1 | Organic | Unverified. [LY Corporation for Business, LINE Official Account Manager manual: Card-based messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/card-based-messages/), [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/) |
| Card-based message, person card | 500 × 500 | 1:1 | Organic | Unverified. [LY Corporation for Business, LINE Official Account Manager manual: Card-based messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/card-based-messages/), [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/) |
| Card-based message, image card | 555 × 500 | 1.11:1 | Organic | Unverified. [LY Corporation for Business, LINE Official Account Manager manual: Card-based messages](https://www.lycbiz.com/jp/manual/OfficialAccountManager/card-based-messages/), [Ligla, LINE Official Account image sizes (blog)](https://ligla.jp/blog/line-official/image/) |
| Coupon image | 640 × 640 | 1:1 | Organic | Unverified. [LINE Developers, Messaging API reference (rich menu image, imagemap, template and coupon images)](https://developers.line.biz/en/reference/messaging-api/), [L Message, LINE Official Account image size list (blog)](https://lme.jp/media/line/image-size) |
| Shop card background | 1920 × 960 | 2:1 | Organic | Unverified. [L Message, LINE Official Account image size list (blog)](https://lme.jp/media/line/image-size) |
| Buttons/carousel template thumbnail (Messaging API) | 1024 × 678 | 1.51:1 | Organic | [LINE Developers, Messaging API reference (rich menu image, imagemap, template and coupon images)](https://developers.line.biz/en/reference/messaging-api/) |
| LINE VOOM post photo | 1080 × 1350 | 4:5 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Creating LINE VOOM posts](https://www.lycbiz.com/jp/manual/OfficialAccountManager/linevoom/list/), [LY Corporation for Business, LINE Official Account Manager manual: LINE VOOM formats](https://www.lycbiz.com/jp/manual/OfficialAccountManager/timeline-formats/) |
| LINE VOOM short video | 1080 × 1920 | 9:16 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Creating LINE VOOM posts](https://www.lycbiz.com/jp/manual/OfficialAccountManager/linevoom/list/) |
| LINE VOOM regular video | 1920 × 1080 | 16:9 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Creating LINE VOOM posts](https://www.lycbiz.com/jp/manual/OfficialAccountManager/linevoom/list/) |
| LINE VOOM video thumbnail | 750 × 993 | 3:4 | Organic | [LY Corporation for Business, LINE Official Account Manager manual: Creating LINE VOOM posts](https://www.lycbiz.com/jp/manual/OfficialAccountManager/linevoom/list/) |
| Sticker set main image | 240 × 240 | 1:1 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/) |
| Sticker (static, message, custom) | 370 × 320 | 37:32 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/) |
| Animated sticker | 320 × 270 | 32:27 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/) |
| Big sticker | 396 × 660 | 3:5 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/) |
| Pop-up sticker effect | 480 × 480 | 1:1 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/) |
| Sticker/emoji chat thumbnail (tab) icon | 96 × 74 | 48:37 | Organic | [LINE Creators Market, Sticker guidelines (stickers, animated, big, pop-up, message, custom)](https://creator.line.me/en/guideline/sticker/), [LINE Creators Market, Emoji and animated emoji guidelines](https://creator.line.me/en/guideline/emoji/) |
| Emoji (static or animated) | 180 × 180 | 1:1 | Organic | [LINE Creators Market, Emoji and animated emoji guidelines](https://creator.line.me/en/guideline/emoji/) |
| LINE Ads Card (image) | 1200 × 628 | 1.91:1 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Square (image) | 1080 × 1080 | 1:1 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Carousel card | 1080 × 1080 | 1:1 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Image (small) | 600 × 400 | 3:2 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Image (animation) | 600 × 400 | 3:2 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Card (video) | 1920 × 1080 | 16:9 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Square (video) | 1280 × 1280 | 1:1 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |
| LINE Ads Vertical (video) | 1080 × 1920 | 9:16 | Ad | [LY Corporation for Business, LINE placement image sizes for LINE Ads (updated 2025-02-05)](https://www.lycbiz.com/jp/column/ly-ads/displayads-auc/creative/20200318-02/) |

### LinkedIn

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed / link post | 1200 × 627 | 1.91:1 | Organic | Unverified. No source recorded. |
| Feed | 1080 × 1080 | 1:1 | Organic | Unverified. No source recorded. |
| Feed / multi-image | 1080 × 1350 | 4:5 | Organic | Unverified. No source recorded. |
| Document post | 1080 × 1350 | 4:5 | Organic | Unverified. [LinkedIn Help, "Upload and share documents on LinkedIn"](https://www.linkedin.com/help/linkedin/answer/a518909), [Guide to LinkedIn PDF carousels (Metricool)](https://metricool.com/linkedin-pdf-carousels/) |
| Feed / video feed | 1080 × 1920 | 9:16 | Organic | Unverified. No source recorded. |
| Article / newsletter | 1920 × 1080 | 16:9 | Organic | Unverified. No source recorded. |
| Event | 1280 × 720 | 16:9 | Organic | Unverified. No source recorded. |
| Group | 1776 × 444 | 4:1 | Organic | Unverified. No source recorded. |
| Personal background | 1584 × 396 | 4:1 | Organic | Unverified. No source recorded. |
| Company Page cover | 1512 × 256 | ~5.9:1 | Organic | Unverified. No source recorded. |
| Profile photo / Page logo | 400 × 400 | 1:1 | Organic | Unverified. [Influencer Marketing Hub, LinkedIn image size recommendations (third-party)](https://influencermarketinghub.com/linkedin-image-size/) |
| Single image ad | 1200 × 628 | 1.91:1 | Ad | Unverified. No source recorded. |
| Single image ad | 1200 × 1200 | 1:1 | Ad | Unverified. No source recorded. |
| Single image / video ad | 720 × 900 | 4:5 | Ad | Unverified. No source recorded. |
| Carousel card | 1080 × 1080 | 1:1 | Ad | Unverified. No source recorded. |
| Video ad | 1080 × 1920 | 9:16 | Ad | Unverified. No source recorded. |
| Message / Conversation ad banner | 300 × 250 | 6:5 | Ad | Unverified. No source recorded. |
| Spotlight / Follower / Text ad | 100 × 100 | 1:1 | Ad | Unverified. No source recorded. |
| Lead gen form header | 552 × 200 | ~2.76:1 | Ad | Unverified. No source recorded. |

### Mastodon

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Post image, single (landscape) | 1920 × 1080 | 16:9 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/), [Mastodon source v4.7.3: app/models/media_attachment.rb](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/media_attachment.rb), [Mastodon source v4.7.3: app/javascript/mastodon/components/media_gallery.jsx and styles/mastodon/components.scss](https://github.com/mastodon/mastodon/blob/v4.7.3/app/javascript/mastodon/components/media_gallery.jsx) |
| Post image, single (square) | 1080 × 1080 | 1:1 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/), [Mastodon source v4.7.3: app/javascript/mastodon/components/media_gallery.jsx and styles/mastodon/components.scss](https://github.com/mastodon/mastodon/blob/v4.7.3/app/javascript/mastodon/components/media_gallery.jsx) |
| Post image, single (portrait) | 1080 × 1350 | 4:5 | Organic | [Mastodon source v4.7.3: app/javascript/mastodon/components/media_gallery.jsx and styles/mastodon/components.scss](https://github.com/mastodon/mastodon/blob/v4.7.3/app/javascript/mastodon/components/media_gallery.jsx) |
| Post image, 2–4 image grid | 1620 × 1080 | 3:2 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/), [Mastodon source v4.7.3: app/javascript/mastodon/components/media_gallery.jsx and styles/mastodon/components.scss](https://github.com/mastodon/mastodon/blob/v4.7.3/app/javascript/mastodon/components/media_gallery.jsx) |
| Post video (landscape) | 1920 × 1080 | 16:9 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/), [Mastodon docs: Instance entity (configuration.media_attachments, thumbnail)](https://docs.joinmastodon.org/entities/Instance/), [Mastodon source v4.7.3: app/models/media_attachment.rb](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/media_attachment.rb) |
| Post video (vertical) | 1080 × 1920 | 9:16 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/), [Mastodon source v4.7.3: app/models/media_attachment.rb](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/media_attachment.rb), [Mastodon source v4.7.3: app/javascript/mastodon/components/media_gallery.jsx and styles/mastodon/components.scss](https://github.com/mastodon/mastodon/blob/v4.7.3/app/javascript/mastodon/components/media_gallery.jsx) |
| Animated GIF | 1280 × 720 | 16:9 | Organic | [Mastodon docs: Posting toots (media limits)](https://docs.joinmastodon.org/user/posting/) |
| Link preview card (og:image) | 1200 × 630 | 1.91:1 | Organic | [Mastodon source v4.7.3: app/models/preview_card.rb and app/javascript/mastodon/features/status/components/card.tsx](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/preview_card.rb) |
| Link preview card (square thumbnail) | 480 × 480 | 1:1 | Organic | [Mastodon source v4.7.3: app/models/preview_card.rb and app/javascript/mastodon/features/status/components/card.tsx](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/preview_card.rb) |
| Profile avatar | 400 × 400 | 1:1 | Organic | [Mastodon docs: Setting up your profile](https://docs.joinmastodon.org/user/profile/), [Mastodon source v4.7.3: app/models/concerns/account/avatar.rb and header.rb](https://github.com/mastodon/mastodon/tree/v4.7.3/app/models/concerns/account) |
| Profile header | 1500 × 500 | 3:1 | Organic | [Mastodon docs: Setting up your profile](https://docs.joinmastodon.org/user/profile/), [Mastodon source v4.7.3: app/models/concerns/account/avatar.rb and header.rb](https://github.com/mastodon/mastodon/tree/v4.7.3/app/models/concerns/account) |
| Server thumbnail (admin) | 1200 × 630 | 1.91:1 | Organic | [Mastodon docs: Instance entity (configuration.media_attachments, thumbnail)](https://docs.joinmastodon.org/entities/Instance/), [Mastodon source v4.7.3: app/models/site_upload.rb](https://github.com/mastodon/mastodon/blob/v4.7.3/app/models/site_upload.rb) |

### Medium

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Story header / featured (preview) image | 1600 × 900 | 16:9 | Organic | [Using images (Medium Help Center)](https://help.medium.com/hc/en-us/articles/215679797-Images), [Setting a featured image on your post (Medium Help Center)](https://help.medium.com/hc/en-us/articles/215680047-Setting-a-featured-image-on-your-post), [Trouble controlling post previews on feeds (Medium Help Center)](https://help.medium.com/hc/en-us/articles/228036227-Trouble-controlling-post-previews-on-feeds) |
| Story inline image (full-width placement) | 1400 × 788 | 16:9 | Organic | Unverified. [Using images (Medium Help Center)](https://help.medium.com/hc/en-us/articles/215679797-Images), [Medium Sizes, Best Practices & Tips (SpecSocial, third-party)](https://spec.social/medium) |
| Social link preview (featured image as share card) | 1200 × 630 | 1.91:1 | Organic | Unverified. [Setting a featured image on your post (Medium Help Center)](https://help.medium.com/hc/en-us/articles/215680047-Setting-a-featured-image-on-your-post), [Medium Sizes, Best Practices & Tips (SpecSocial, third-party)](https://spec.social/medium) |
| Profile photo | 1000 × 1000 | 1:1 | Organic | Unverified. [Your profile page (Medium Help Center)](https://help.medium.com/hc/en-us/articles/115004747067-Your-profile-page), [60x60 Medium Publication Avatar (Kapwing, third-party)](https://www.kapwing.com/explore/60x60-medium-publication-avatar), [How to Create an Attractive Profile on Medium (MakeUseOf, third-party, 2021)](https://www.makeuseof.com/how-to-create-profile-medium) |
| Profile page header background | 1500 × 500 | 3:1 | Organic | Unverified. [Your profile page (Medium Help Center)](https://help.medium.com/hc/en-us/articles/115004747067-Your-profile-page), [How to Create an Attractive Profile on Medium (MakeUseOf, third-party, 2021)](https://www.makeuseof.com/how-to-create-profile-medium) |
| Publication avatar (logo) | 1000 × 1000 | 1:1 | Organic | Unverified. [Info & Homepage, Customizing your publication settings and layout (Medium Help Center)](https://help.medium.com/hc/en-us/articles/34508714374679), [60x60 Medium Publication Avatar (Kapwing, third-party)](https://www.kapwing.com/explore/60x60-medium-publication-avatar) |
| Publication homepage header background | 1600 × 200 | 8:1 | Organic | [Info & Homepage, Customizing your publication settings and layout (Medium Help Center)](https://help.medium.com/hc/en-us/articles/34508714374679) |
| Publication homepage promo block | 1200 × 350 | 24:7 | Organic | [Info & Homepage, Customizing your publication settings and layout (Medium Help Center)](https://help.medium.com/hc/en-us/articles/34508714374679) |

### Meetup

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Group cover photo (group banner) | 1200 × 675 | 16:9 | Organic | [How to set and change a group's cover photo (Meetup Help)](https://help.meetup.com/hc/en-us/articles/39287743789325-How-to-set-and-change-a-group-s-cover-photo), [Why can't I upload a photo to my group or profile? (Meetup Help)](https://help.meetup.com/hc/en-us/articles/360002879831-Why-can-t-I-upload-a-photo-to-my-group-or-profile) |
| Event featured photo | 1200 × 675 | 16:9 | Organic | Unverified. [Why can't I upload a photo to my group or profile? (Meetup Help)](https://help.meetup.com/hc/en-us/articles/360002879831-Why-can-t-I-upload-a-photo-to-my-group-or-profile), [Creating an event (Meetup Help)](https://help.meetup.com/hc/en-us/articles/39790436736525-Creating-an-event), [Eventbrite Image Size, Plus Luma and Meetup Specs (kapa99 blog, 2026-10-11)](https://kapa99.com/blog/event-listing-image-sizes/) |
| Member profile photo | 400 × 400 | 1:1 | Organic | [Changing or removing a profile photo (Meetup Help)](https://help.meetup.com/hc/en-us/articles/360002878591) |
| Sponsor logo (group / Pro network pages) | 120 × 90 | 4:3 | Organic | Unverified. [Meetup Pro: Displaying a sponsor (Meetup Help)](https://help.meetup.com/hc/en-us/articles/4404960838797-Meetup-Pro-Displaying-a-sponsor), [How to Add Sponsor to Meetup com Group (TheTechTips.blog, 2026-08-25)](https://www.thetechtips.blog/how-to-add-sponsor-meetup-group) |

### Messenger

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Chat image (HD) | 4096 × 4096 | 1:1 | Organic | [HD Photos, Shared Albums and More on Messenger (Meta newsroom, 2024-04-09)](https://about.fb.com/news/2024/04/hd-photos-shared-albums-and-more-on-messenger/), [Messenger 4K photos and file limits (Android Authority)](https://www.androidauthority.com/messenger-4k-photos-file-limits-3433280) |
| Chat image (standard) | 2048 × 2048 | 1:1 | Organic | Unverified. [Messenger 4K photos and file limits (Android Authority)](https://www.androidauthority.com/messenger-4k-photos-file-limits-3433280) |
| Profile picture | 320 × 320 | 1:1 | Organic | [Facebook Page profile picture and cover photo dimensions (Facebook Help Center)](https://www.facebook.com/help/125379114252045) |
| Group chat photo | 320 × 320 | 1:1 | Organic | Unverified. [Facebook Page profile picture and cover photo dimensions (Facebook Help Center)](https://www.facebook.com/help/125379114252045) |
| Story (shared from Facebook) | 1080 × 1920 | 9:16 | Organic | [Meta Ads Guide: Facebook Stories image](https://www.facebook.com/business/ads-guide/update/image/facebook-story) |
| Business chat card (generic template) | 1200 × 628 | 1.91:1 | Organic | [Messenger Platform: Generic Template](https://developers.facebook.com/docs/messenger-platform/send-messages/template/generic) |
| Business chat card, square | 1080 × 1080 | 1:1 | Organic | [Messenger Platform changelog (image_aspect_ratio horizontal/square)](https://developers.facebook.com/docs/messenger-platform/changelog/) |
| Click-to-Messenger ad (Facebook feed) | 1440 × 1800 | 4:5 | Ad | [Meta Ads Guide: Facebook Feed image](https://www.facebook.com/business/ads-guide/update/image/facebook-feed) |
| Click-to-Messenger ad (Facebook Stories) | 1440 × 2560 | 9:16 | Ad | [Meta Ads Guide: Facebook Stories image](https://www.facebook.com/business/ads-guide/update/image/facebook-story) |

### Nextdoor

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Post photo, square | 1080 × 1080 | 1:1 | Organic | [Upload images and videos to agency posts on Nextdoor (Help Center)](https://help.nextdoor.com/s/article/how-to-attach-files-to-posts?language=en_US), [Nextdoor Developer: Sharing data types](https://developer.nextdoor.com/reference/sharing-data-types) |
| Post photo, landscape | 1920 × 1080 | 16:9 | Organic | [Upload images and videos to agency posts on Nextdoor (Help Center)](https://help.nextdoor.com/s/article/how-to-attach-files-to-posts?language=en_US), [Nextdoor Developer: Sharing data types](https://developer.nextdoor.com/reference/sharing-data-types) |
| Post video, landscape | 1920 × 1080 | 16:9 | Organic | [Upload images and videos to agency posts on Nextdoor (Help Center)](https://help.nextdoor.com/s/article/how-to-attach-files-to-posts?language=en_US), [Nextdoor Developer: Sharing data types](https://developer.nextdoor.com/reference/sharing-data-types) |
| Post video, vertical | 1080 × 1920 | 9:16 | Organic | [Upload images and videos to agency posts on Nextdoor (Help Center)](https://help.nextdoor.com/s/article/how-to-attach-files-to-posts?language=en_US) |
| Event cover image | 1500 × 600 | 5:2 | Organic | [Upload images and videos to agency posts on Nextdoor (Help Center)](https://help.nextdoor.com/s/article/how-to-attach-files-to-posts?language=en_US) |
| Profile picture | 500 × 500 | 1:1 | Organic | [Add a profile picture (Help Center)](https://help.nextdoor.com/s/article/add-a-profile-picture?language=en_US) |
| Profile cover photo | 1500 × 600 | 5:2 | Organic | [Add a cover photo to your Nextdoor profile (Help Center)](https://help.nextdoor.com/s/article/Add-a-cover-photo?language=en_US) |
| Business Page logo | 500 × 500 | 1:1 | Organic | [Edit your business page information (Help Center)](https://help.nextdoor.com/s/article/How-to-fix-your-business-information?language=en_GB) |
| Business Page cover photo | 1156 × 650 | 16:9 | Organic | [Edit your business page information (Help Center)](https://help.nextdoor.com/s/article/How-to-fix-your-business-information?language=en_GB) |
| Newsfeed image ad, landscape | 1200 × 628 | 1.91:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Newsfeed image ad, square | 1200 × 1200 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Newsfeed video ad, landscape | 1920 × 1080 | 16:9 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Newsfeed video ad, square | 1080 × 1080 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Newsfeed carousel ad card | 1200 × 1200 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Lead gen ad, landscape | 1920 × 1080 | 16:9 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Lead gen ad, square | 1200 × 1200 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| For Sale & Free image ad | 1200 × 1200 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Right Hand Rail image ad (desktop) | 1200 × 1200 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Ad advertiser logo | 100 × 100 | 1:1 | Ad | [Nextdoor Ads Creative Specifications & Dimensions](https://business.nextdoor.com/enterprise/creative-specs) |
| Small-business self-serve Newsfeed photo ad | 1080 × 540 | 2:1 | Ad | [Advertising creative specs (Nextdoor small business)](https://business.nextdoor.com/en-us/small-business/resources/ads-creative-specs) |

### Patreon

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Creator page cover photo (current page) | 2500 × 1000 | 5:2 | Organic | [How to change your cover image](https://support.patreon.com/hc/en-us/articles/203913369-Change-my-cover-image) |
| Hero image (legacy creator page) | 1600 × 400 | 4:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts), [How to change your cover image](https://support.patreon.com/hc/en-us/articles/203913369-Change-my-cover-image) |
| Profile image | 1024 × 1024 | 1:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts), [How to change your cover image](https://support.patreon.com/hc/en-us/articles/203913369-Change-my-cover-image) |
| Image post (post feed) | 1920 × 1080 | 16:9 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts), [Posting images](https://support.patreon.com/hc/en-us/articles/360038247591-Posting-images) |
| Inline image in a text post | 1920 × 1080 | 16:9 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Post image, portrait | 1500 × 1875 | 4:5 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Post image, square / gallery thumbnail | 1500 × 1500 | 1:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts), [Posting images](https://support.patreon.com/hc/en-us/articles/360038247591-Posting-images) |
| Post image, film strip | 1500 × 789 | 1.9:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Custom post thumbnail | 1920 × 1080 | 16:9 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts), [Posting to your Patreon](https://support.patreon.com/hc/en-us/articles/115004048046-Posting-to-your-Patreon) |
| Video thumbnail | 1280 × 720 | 16:9 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Native video post (Patreon Video) | 1920 × 1080 | 16:9 | Organic | [Patreon Video overview](https://support.patreon.com/hc/en-us/articles/6598555214477-Patreon-Video-overview), [What file formats are supported for posts?](https://support.patreon.com/hc/en-us/articles/204606055-What-file-formats-are-supported-for-posts) |
| Membership tier image | 460 × 200 | 2.3:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Digital product (shop) image | 984 × 554 | 16:9 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Digital product hero image | 400 × 400 | 1:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Collection cover | 1024 × 1024 | 1:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Audio / podcast artwork | 1024 × 1024 | 1:1 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |
| Drops cover image | 1080 × 810 | 4:3 | Organic | [How do I size images for Patreon posts?](https://support.patreon.com/hc/en-us/articles/360038982432-How-do-I-size-images-for-Patreon-posts) |

### Pinterest

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Standard Pin | 1000 × 1500 | 2:3 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs), [Creative best practices / ad specs (Pinterest Business)](https://business.pinterest.com/creative-best-practices/) |
| Full-screen Pin | 1080 × 1920 | 9:16 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Square Pin | 1000 × 1000 | 1:1 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Video Pin | 1080 × 1350 | 4:5 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Video Pin | 1080 × 1440 | 3:4 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Tall video Pin | 1080 × 2160 | 1:2 | Organic | [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Collage Pin | 1000 × 1500 | 2:3 | Organic | Unverified. [How to make a collage on Pinterest (PinGenerator, third-party)](https://pingenerator.com/blog/how-to-make-a-collage-on-pinterest) |
| Profile cover | 1600 × 900 | 16:9 | Organic | [Add a profile cover (Pinterest Help)](https://help.pinterest.com/en-gb/node/3521) |
| Profile picture | 600 × 600 | 1:1 | Organic | Unverified. [Pinterest profile picture size (Moda, third-party)](https://moda.app/resources/sizes/pinterest-profile-picture) |
| Standard image ad | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs), [Creative best practices / ad specs (Pinterest Business)](https://business.pinterest.com/creative-best-practices/) |
| Standard video ad | 1080 × 1920 | 9:16 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs), [Review Pin specs (Pinterest Help)](https://help.pinterest.com/en/article/review-pin-specs) |
| Standard video ad | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Standard video ad | 1080 × 1350 | 4:5 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Standard video ad | 1080 × 1080 | 1:1 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Max-width video ad | 1920 × 1080 | 16:9 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Max-width video ad | 1080 × 1080 | 1:1 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Carousel ad card | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Carousel ad card | 1000 × 1000 | 1:1 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Collections ad hero | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Collections ad secondary | 1000 × 1000 | 1:1 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Idea ad | 1080 × 1920 | 9:16 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Showcase ad (title Pin and cards) | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Showcase ad feature | 1000 × 1000 | 1:1 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Quiz ad (title and result Pins) | 1000 × 1500 | 2:3 | Ad | [Pinterest product specs (Pinterest Business Help)](https://help.pinterest.com/en/business/article/pinterest-product-specs) |
| Premiere Spotlight ad | 1920 × 1080 | 16:9 | Ad | Unverified. [Creative best practices / ad specs (Pinterest Business)](https://business.pinterest.com/creative-best-practices/), [Pinterest ad specs (Strike Social blog, third-party)](https://strikesocial.com/blog/pinterest-ad-specs/) |
| Premiere Spotlight ad | 1080 × 1080 | 1:1 | Ad | Unverified. [Pinterest ad specs (Strike Social blog, third-party)](https://strikesocial.com/blog/pinterest-ad-specs/) |

### Product Hunt

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Product thumbnail / logo | 240 × 240 | 1:1 | Organic | [Product Hunt: Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch), [Product Hunt Help Center: How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) |
| Gallery image | 1270 × 760 |  | Organic | [Product Hunt: Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch), [Product Hunt Help Center: How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) |
| Gallery video | 1920 × 1080 | 16:9 | Organic | [Product Hunt: Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch), [Product Hunt Help Center: How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) |
| Social share image (og:image) | 1024 × 512 | 2:1 | Organic | [Product Hunt product page og:image / twitter:image meta tags (for example, Notion)](https://www.producthunt.com/products/notion) |
| Maker profile avatar | 400 × 400 | 1:1 | Organic | Unverified. [Screenhance: Product Hunt gallery and header image sizes](https://screenhance.com/blog/product-hunt-gallery-size) |
| Profile header | 1500 × 500 | 3:1 | Organic | Unverified. [Indie Hackers post on Product Hunt header size](https://indiehackers.com/post/d46584b7f2) |

### Quora

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile photo | 400 × 400 | 1:1 | Organic | Unverified. [How do I add or change my Quora profile picture?, Quora Help Center](https://help.quora.com/hc/en-us/articles/115004231606-How-do-I-add-or-change-my-Quora-profile-picture), [Quora Profile Picture Size (third-party), PostSize](https://postsize.org/quora/profile-picture-size), [Quora Image Sizes, Character Limits & Ad Sizes (third-party), AllPlatforms](https://allplatforms.io/quora) |
| Answer / post image (landscape) | 1200 × 675 | 16:9 | Organic | Unverified. [Quora Image Sizes, Character Limits & Ad Sizes (third-party), AllPlatforms](https://allplatforms.io/quora), [What is the best image size for a Quora answer? (community answers, including a Quora engineer on the 10 MB limit), Quora](https://www.quora.com/What-is-the-best-image-size-for-a-Quora-answer) |
| Space icon | 500 × 500 | 1:1 | Organic | [How do I start a Space?, Quora Help Center](https://help.quora.com/hc/en-us/articles/360061074032-How-do-I-start-a-Space) |
| Space cover photo | 1600 × 400 | 4:1 | Organic | [How do I start a Space?, Quora Help Center](https://help.quora.com/hc/en-us/articles/360061074032-How-do-I-start-a-Space), [Quora Image Sizes, Character Limits & Ad Sizes (third-party), AllPlatforms](https://allplatforms.io/quora) |
| Image ad, hero 16:9 | 1200 × 675 | 16:9 | Ad | [Overview of Image Ads, Quora Ad Support (updated 2026-02-12)](https://quoraadsupport.zendesk.com/hc/en-us/articles/360029041712-Overview-of-Image-Ads), [Quora Ad Unit Specifications, Quora for Business](https://business.quora.com/advertising/ad-specs), [Quora Ads now accepts the most common image sizes, Quora for Business (2023-05-04)](https://business.quora.com/resources/quora-ads-image-sizes) |
| Image ad, hero 5:4 | 1080 × 864 | 5:4 | Ad | [Quora Ads now accepts the most common image sizes, Quora for Business (2023-05-04)](https://business.quora.com/resources/quora-ads-image-sizes) |
| Image ad, hero 1:1 | 1080 × 1080 | 1:1 | Ad | [Overview of Image Ads, Quora Ad Support (updated 2026-02-12)](https://quoraadsupport.zendesk.com/hc/en-us/articles/360029041712-Overview-of-Image-Ads), [Quora Ad Unit Specifications, Quora for Business](https://business.quora.com/advertising/ad-specs) |
| Image ad, hero 4:5 | 1080 × 1350 | 4:5 | Ad | [Overview of Image Ads, Quora Ad Support (updated 2026-02-12)](https://quoraadsupport.zendesk.com/hc/en-us/articles/360029041712-Overview-of-Image-Ads), [Quora Ads now accepts the most common image sizes, Quora for Business (2023-05-04)](https://business.quora.com/resources/quora-ads-image-sizes) |
| Video ad | 1280 × 720 | 16:9 | Ad | [Overview of Video Ads, Quora Ad Support (updated 2026-06-17)](https://quoraadsupport.zendesk.com/hc/en-us/articles/9637255986701-Overview-of-Video-Ads), [Quora Ad Unit Specifications, Quora for Business](https://business.quora.com/advertising/ad-specs) |
| Ad company logo (Image, Video, Promoted Answer, Lead Gen ads) | 500 × 500 | 1:1 | Ad | [Overview of Image Ads, Quora Ad Support (updated 2026-02-12)](https://quoraadsupport.zendesk.com/hc/en-us/articles/360029041712-Overview-of-Image-Ads), [Quora Ad Unit Specifications, Quora for Business](https://business.quora.com/advertising/ad-specs) |

### Reddit

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Image post, portrait | 1080 × 1350 | 4:5 | Organic | Unverified. [(U) Reddit Image Resizer – sizes table (Keywords Everywhere)](https://keywordseverywhere.com/tools/reddit-image-resizer/) |
| Image post, square | 1080 × 1080 | 1:1 | Organic | Unverified. [(U) Reddit Image Resizer – sizes table (Keywords Everywhere)](https://keywordseverywhere.com/tools/reddit-image-resizer/) |
| Image post, landscape | 1920 × 1080 | 16:9 | Organic | Unverified. [(U) Reddit Image Resizer – sizes table (Keywords Everywhere)](https://keywordseverywhere.com/tools/reddit-image-resizer/) |
| Video post | 1920 × 1080 | 16:9 | Organic | Unverified. [(U) Reddit Image Resizer – sizes table (Keywords Everywhere)](https://keywordseverywhere.com/tools/reddit-image-resizer/) |
| Link post preview image | 1200 × 628 | 1.91:1 | Organic | Unverified. [(U) Reddit Image Resizer – sizes table (Keywords Everywhere)](https://keywordseverywhere.com/tools/reddit-image-resizer/) |
| Community icon | 300 × 300 | 1:1 | Organic | [Community icon – Reddit Help](https://support.reddithelp.com/hc/en-us/articles/15484265952660-Community-icon) |
| Community banner, mobile | 1080 × 128 | 135:16 | Organic | [Banner – Reddit Help](https://support.reddithelp.com/hc/en-us/articles/15484339588884-Banner) |
| Community banner, desktop | 1072 × 128 | 67:8 | Organic | [Banner – Reddit Help](https://support.reddithelp.com/hc/en-us/articles/15484339588884-Banner) |
| Profile picture (avatar) | 256 × 256 | 1:1 | Organic | [(U) r/help: profile picture upload message "exactly 256x256"](https://www.reddit.com/r/help/comments/1lx4lgo/hi_im_trying_to_change_my_profile_pic_but_it_says) |
| Profile banner | 1600 × 480 | 10:3 | Organic | Unverified. No source recorded. |
| Image ad, square | 1080 × 1080 | 1:1 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Image ad, portrait 4:5 | 1080 × 1350 | 4:5 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Image ad, portrait 3:4 | 1080 × 1440 | 3:4 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Image ad, landscape 4:3 | 1440 × 1080 | 4:3 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Image ad, landscape 16:9 | 1920 × 1080 | 16:9 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Ad thumbnail (compact/conversation) | 400 × 300 | 4:3 | Ad | [Image Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/image-ad-specifications) |
| Video ad, square | 1200 × 1200 | 1:1 | Ad | [Video Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/video-ad-specifications) |
| Video ad, portrait 4:5 | 1200 × 1500 | 4:5 | Ad | [Video Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/video-ad-specifications) |
| Video ad, portrait 3:4 | 900 × 1200 | 3:4 | Ad | [Video Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/video-ad-specifications) |
| Video ad, landscape 4:3 | 1440 × 1080 | 4:3 | Ad | [Video Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/video-ad-specifications) |
| Video ad, landscape 16:9 | 1920 × 1080 | 16:9 | Ad | [Video Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/video-ad-specifications) |
| Carousel ad card, square | 1200 × 1200 | 1:1 | Ad | [Carousel Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/carousel-ad-specifications) |
| Carousel ad card, portrait 4:5 | 1200 × 1500 | 4:5 | Ad | [Carousel Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/carousel-ad-specifications) |
| Carousel ad card, 4:3 | 1440 × 1080 | 4:3 | Ad | [Carousel Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/carousel-ad-specifications) |
| Carousel ad card, 16:9 | 1920 × 1080 | 16:9 | Ad | [Carousel Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/carousel-ad-specifications) |
| Free-form / Max campaign image | 1200 × 1200 | 1:1 | Ad | [Free-form Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/free-form-ad-specifications), [Max Campaigns Ad Specifications – Reddit Ads Help](https://business.reddithelp.com/s/article/max-specifications) |
| Takeover sidebar, above the fold | 1080 × 1920 | 9:16 | Ad | [Ad Unit Specifications (Premium Takeovers) – Reddit Ads Help](https://business.reddithelp.com/s/article/Reddit-Ad-Unit-Specifications) |
| Takeover sidebar, below the fold | 1080 × 1080 | 1:1 | Ad | [Ad Unit Specifications (Premium Takeovers) – Reddit Ads Help](https://business.reddithelp.com/s/article/Reddit-Ad-Unit-Specifications) |
| Takeover display, half page | 300 × 600 | 1:2 | Ad | [Ad Unit Specifications (Premium Takeovers) – Reddit Ads Help](https://business.reddithelp.com/s/article/Reddit-Ad-Unit-Specifications) |
| Takeover display, rectangle | 300 × 250 | 6:5 | Ad | [Ad Unit Specifications (Premium Takeovers) – Reddit Ads Help](https://business.reddithelp.com/s/article/Reddit-Ad-Unit-Specifications) |

### Rumble

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Video (landscape) | 1920 × 1080 | 16:9 | Organic | Unverified. [Rumble Image Sizes, Video Specs & Character Limits (2026), allplatforms.io (third-party)](https://allplatforms.io/rumble/) |
| Short | 1080 × 1920 | 9:16 | Organic | [Shorts 101 (Rumble help center)](https://rumble.support/help/shorts) |
| Short (square) | 1080 × 1080 | 1:1 | Organic | [Shorts 101 (Rumble help center)](https://rumble.support/help/shorts) |
| Live stream | 1920 × 1080 | 16:9 | Organic | Unverified. [Rumble Image Sizes, Video Specs & Character Limits (2026), allplatforms.io (third-party)](https://allplatforms.io/rumble/) |
| Video thumbnail | 1280 × 720 | 16:9 | Organic | [Changing a thumbnail (Rumble help center)](https://rumble.support/help/changing-a-thumbnail) |
| Channel backsplash (banner) | 3600 × 600 | 6:1 | Organic | [Channel backsplash dimensions and best practices (Rumble help center)](https://rumble.support/help/channel-backsplash-dimensions-and-best-practices) |
| Channel profile picture | 400 × 400 | 1:1 | Organic | Unverified. [Rumble Image Sizes, Video Specs & Character Limits (2026), allplatforms.io (third-party)](https://allplatforms.io/rumble/) |
| Pre-roll video ad | 1920 × 1080 | 16:9 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Pre-roll video ad (4:3) | 1440 × 1080 | 4:3 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad, leaderboard (Rumble) | 728 × 90 | 91:11 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad, medium rectangle (Rumble) | 300 × 250 | 6:5 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad (partner network, Truth Social) | 420 × 315 | 4:3 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad (partner network) | 822 × 175 | 822:175 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad (partner network) | 800 × 450 | 16:9 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad (partner network) | 1600 × 900 | 16:9 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad, wide skyscraper (partner network) | 160 × 600 | 4:15 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad, large mobile banner (partner network) | 320 × 100 | 16:5 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |
| Display ad, mobile banner (partner network) | 320 × 50 | 32:5 | Ad | [Creatives, Rumble Advertising docs](https://ads.rumble.com/docs/advertising/get-started/creatives) |

### Snapchat

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Story (My Story / Public Story) | 1080 × 1920 | 9:16 | Organic | Unverified. [Snapchat Image Size Guide 2026 (third party)](https://www.picssizer.com/image-sizes/snapchat), [Single Image or Video Specifications](https://businesshelp.snapchat.com/s/article/top-snap-specs) |
| Spotlight video | 1080 × 1920 | 9:16 | Organic | Unverified. [How do I post Snaps to Spotlight?](https://help.snapchat.com/hc/en-us/articles/7012288096532-How-do-I-post-Snaps-to-Spotlight), [Snapchat Image Size Guide 2026 (third party)](https://www.picssizer.com/image-sizes/snapchat) |
| Public Profile picture | 320 × 320 | 1:1 | Organic | Unverified. [How do I add or update the profile picture on my Public Profile?](https://help.snapchat.com/hc/en-us/articles/31116069482388), [Snapchat Ad Specs and Dimensions](https://forbusiness.snapchat.com/en-US/resources/advertising-guides/ad-specs) |
| Public Profile for Business header (hero) image | 375 × 569 | ~2:3 | Organic | [Set Up a Header Image](https://businesshelp.snapchat.com/s/article/public-profiles-header) |
| Custom (on-demand) filter overlay | 1080 × 2340 | 6:13 | Organic | Unverified. [Snapchat Image Size (third party)](https://mediasizes.com/snapchat-image-size), [Snapchat Image Sizes 2026 (third party)](https://imresizer.com/blog/snapchat-image-sizes-2026-complete-guide) |
| Lens icon (Lens Studio) | 320 × 320 | 1:1 | Organic | [Creating an Icon (Lens Studio)](https://developers.snap.com/lens-studio/publishing/configuring/creating-an-icon) |
| Lens preview video | 1080 × 1920 | 9:16 | Organic | [Preview Videos (Lens Studio)](https://developers.snap.com/lens-studio/publishing/configuring/creating-a-preview-video) |
| Single Image or Video ad (Stories, Spotlight, between content) | 1080 × 1920 | 9:16 | Ad | [Single Image or Video Specifications](https://businesshelp.snapchat.com/s/article/top-snap-specs), [Single Image or Video Creative Best Practices](https://businesshelp.snapchat.com/s/article/snap-ads-practices) |
| Story ad (each Snap in the series) | 1080 × 1920 | 9:16 | Ad | [Story Ad Specifications](https://businesshelp.snapchat.com/s/article/story-ad-specs), [Single Image or Video Specifications](https://businesshelp.snapchat.com/s/article/top-snap-specs) |
| Story ad tile (Discover) | 360 × 600 | 3:5 | Ad | [Story Ad Specifications](https://businesshelp.snapchat.com/s/article/story-ad-specs) |
| Story ad tile logo | 993 × 284 | ~7:2 | Ad | [Story Ad Specifications](https://businesshelp.snapchat.com/s/article/story-ad-specs) |
| Collection ad main creative | 1080 × 1920 | 9:16 | Ad | [Collection Ad Specifications](https://businesshelp.snapchat.com/s/article/collection-ad-specs), [Collection Ad Restrictions](https://businesshelp.snapchat.com/s/article/collection-ad-restrictions) |
| Collection ad product thumbnail | 500 × 500 | 1:1 | Ad | Unverified. [Collection Ad Specifications](https://businesshelp.snapchat.com/s/article/collection-ad-specs) |
| Commercial (non-skippable) | 1080 × 1920 | 9:16 | Ad | [Commercial Specifications](https://businesshelp.snapchat.com/s/article/commercial-specs) |
| Sponsored Snaps branded chat background | 1080 × 1920 | 9:16 | Ad | [Snapchat Ad Specs and Dimensions](https://forbusiness.snapchat.com/en-US/resources/advertising-guides/ad-specs) |
| Sponsored AR Filter (static) | 945 × 2048 | ~6:13 | Ad | [AR Filter Specifications](https://businesshelp.snapchat.com/s/article/ar-filter-specs) |
| Sponsored AR Filter (moving) | 720 × 1560 | 6:13 | Ad | [AR Filter Specifications](https://businesshelp.snapchat.com/s/article/ar-filter-specs) |

### SoundCloud

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Track artwork | 800 × 800 | 1:1 | Organic | [Edit and customize your tracks – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks) |
| Playlist / album artwork | 800 × 800 | 1:1 | Organic | [Creating and customizing a playlist – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/115003452207-Managing-and-customizing-your-playlist) |
| Profile image (avatar) | 800 × 800 | 1:1 | Organic | [Update Your Profile Image and Header – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/115003450007-Profile-image-and-header) |
| Profile header / banner | 2480 × 520 |  | Organic | [Update Your Profile Image and Header – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/115003450007-Profile-image-and-header) |
| Podcast cover (profile image used in RSS) | 3000 × 3000 | 1:1 | Organic | [Your Podcast's Artwork – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/115003446687-Your-Podcast-s-Artwork) |
| Release artwork (digital distribution) | 3000 × 3000 | 1:1 | Organic | [Artwork Guidelines for Digital Distribution – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/40259650089243-Artwork-Guidelines-for-Digital-Distribution) |
| Release artwork (vinyl distribution) | 3000 × 3000 | 1:1 | Organic | [Artwork guidelines for vinyl distribution – SoundCloud Help Center](https://help.soundcloud.com/hc/en-us/articles/37754876259611-Artwork-guidelines-for-vinyl-distribution) |
| Audio ad companion image | 1024 × 1024 | 1:1 | Ad | Unverified. [Ad specifications – Adobe Advertising (Experience League)](https://experienceleague.adobe.com/en/docs/advertising/dsp/campaign-management/ads/ad-specs) |

### Spotify and podcasts

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Artist profile picture (avatar) | 1500 × 1500 | 1:1 | Organic | [Artist image guidelines – Spotify for Artists](https://support.spotify.com/us/artists/article/artist-image-guidelines/), [Managing your artist images on Spotify](https://support.spotify.com/us/artists/article/managing-your-artist-images-on-spotify/) |
| Artist header image | 2660 × 1140 | 7:3 | Organic | [Artist image guidelines – Spotify for Artists](https://support.spotify.com/us/artists/article/artist-image-guidelines/), [Managing your artist images on Spotify](https://support.spotify.com/us/artists/article/managing-your-artist-images-on-spotify/) |
| Artist gallery image | 1380 × 1000 | 69:50 | Organic | [Artist image guidelines – Spotify for Artists](https://support.spotify.com/us/artists/article/artist-image-guidelines/), [Managing your artist images on Spotify](https://support.spotify.com/us/artists/article/managing-your-artist-images-on-spotify/) |
| Album or single cover art | 3000 × 3000 | 1:1 | Organic | [Cover art requirements – Spotify for Artists](https://support.spotify.com/us/artists/article/cover-art-requirements/) |
| Canvas (looping track visual) | 1080 × 1920 | 9:16 | Organic | [Canvas guidelines – Spotify for Artists](https://support.spotify.com/us/artists/article/canvas-guidelines/) |
| Music video (Spotify for Artists) | 1920 × 1080 | 16:9 | Organic | [Uploading videos in Spotify for Artists](https://support.spotify.com/us/artists/article/uploading-videos/) |
| Playlist cover | 1080 × 1080 | 1:1 | Organic | Unverified. [(U) Spotify playlist cover size – Snappa blog](https://snappa.com/blog/spotify-playlist-cover-size/), [Add Custom Playlist Cover Image – Spotify Web API](https://developer.spotify.com/documentation/web-api/reference/upload-custom-playlist-cover) |
| Podcast show cover (Spotify for Creators) | 3000 × 3000 | 1:1 | Organic | [The dos and don'ts of show art – Spotify for Creators](https://creators.spotify.com/resources/dos-donts-showart) |
| Podcast episode art (Spotify for Creators) | 3000 × 3000 | 1:1 | Organic | [The dos and don'ts of show art – Spotify for Creators](https://creators.spotify.com/resources/dos-donts-showart), [Uploading cover art – Spotify for Creators](https://support.spotify.com/us/creators/article/uploading-cover-art/) |
| Video podcast episode thumbnail | 1920 × 1080 | 16:9 | Organic | [Thumbnails – Spotify for Creators](https://support.spotify.com/us/creators/article/thumbnails/) |
| Video podcast episode | 1920 × 1080 | 16:9 | Organic | [Video specs – Spotify for Creators](https://support.spotify.com/us/creators/article/video-specs/) |
| Apple Podcasts show cover | 3000 × 3000 | 1:1 | Organic | [Content Requirements, Artwork – Apple Podcasts for Creators](https://podcasters.apple.com/support/artwork-requirements), [Show Cover – Apple Podcasts for Creators](https://podcasters.apple.com/support/5514-show-cover-template) |
| Apple Podcasts episode art | 3000 × 3000 | 1:1 | Organic | [Episode Art – Apple Podcasts for Creators](https://podcasters.apple.com/support/5516-episode-art-template) |
| Apple Podcasts chapter art | 3000 × 3000 | 1:1 | Organic | [Chapter Art – Apple Podcasts for Creators](https://podcasters.apple.com/support/5528-chapter-art-template) |
| Apple Podcasts full page show art | 2048 × 2732 | 3:4 | Organic | [Full Page Show Art – Apple Podcasts for Creators](https://podcasters.apple.com/support/5515-full-page-show-art-template) |
| Apple Podcasts showcase hero (show) | 4320 × 1080 | 4:1 | Organic | [Showcase Hero – Apple Podcasts for Creators](https://podcasters.apple.com/support/5522-show-hero-template) |
| Apple Podcasts channel icon | 3000 × 3000 | 1:1 | Organic | [Channel Icon – Apple Podcasts for Creators](https://podcasters.apple.com/support/5518-channel-icon-template) |
| Apple Podcasts channel logo | 3000 × 750 | 4:1 | Organic | [Channel Logo – Apple Podcasts for Creators](https://podcasters.apple.com/support/5517-channel-logo-template) |
| Apple Podcasts channel background | 4320 × 3240 | 4:3 | Organic | [Channel Background – Apple Podcasts for Creators](https://podcasters.apple.com/support/5521-channel-background-template) |
| Apple Podcasts channel cover | 3000 × 3000 | 1:1 | Organic | [Channel Cover – Apple Podcasts for Creators](https://podcasters.apple.com/support/5526-channel-cover-template) |
| Apple Podcasts channel showcase hero | 4320 × 1080 | 4:1 | Organic | [Channel Showcase Hero – Apple Podcasts for Creators](https://podcasters.apple.com/support/5524-channel-hero-template) |
| Apple Podcasts subscription promotion | 3000 × 3000 | 1:1 | Organic | [Subscription Promotion – Apple Podcasts for Creators](https://podcasters.apple.com/support/5527-subscription-promotion-template) |
| Apple Podcasts subscription icon | 1080 × 1080 | 1:1 | Organic | [Subscription Icon – Apple Podcasts for Creators](https://podcasters.apple.com/support/5519-subscription-icon-template) |
| Audio/video ad companion display unit | 640 × 640 | 1:1 | Ad | [Audio ad specs & requirements – Spotify Advertising](https://ads.spotify.com/en-CA/ad-specs/audio-ad-specs/), [Video takeover ad specs – Spotify Advertising](https://ads.spotify.com/en-US/ad-experiences/video-takeover-ad-specs/), [Sponsored Playlist ad specs – Spotify Advertising](https://ads.spotify.com/en-SG/ad-specs/sponsored-playlist-ad-specs/) |
| Advertiser logo (ads) | 640 × 640 | 1:1 | Ad | [Audio ad specs & requirements – Spotify Advertising](https://ads.spotify.com/en-CA/ad-specs/audio-ad-specs/), [Video takeover ad specs – Spotify Advertising](https://ads.spotify.com/en-US/ad-experiences/video-takeover-ad-specs/), [Sponsored Playlist ad specs – Spotify Advertising](https://ads.spotify.com/en-SG/ad-specs/sponsored-playlist-ad-specs/) |
| Podcast ad call-to-action card | 640 × 640 | 1:1 | Ad | [Audio ad specs & requirements – Spotify Advertising](https://ads.spotify.com/en-CA/ad-specs/audio-ad-specs/) |
| Canvas ad (mobile ad break) | 720 × 1280 | 9:16 | Ad | [Audio ad specs & requirements – Spotify Advertising](https://ads.spotify.com/en-CA/ad-specs/audio-ad-specs/), [Introducing Canvas for Advertisers – Spotify Advertising](https://ads.spotify.com/en-US/news-and-insights/introducing-canvas-for-ads/) |
| Video ad, portrait (mobile) | 720 × 1280 | 9:16 | Ad | [Video takeover ad specs – Spotify Advertising](https://ads.spotify.com/en-US/ad-experiences/video-takeover-ad-specs/) |
| Video ad, landscape (desktop and mobile) | 1280 × 720 | 16:9 | Ad | [Video takeover ad specs – Spotify Advertising](https://ads.spotify.com/en-US/ad-experiences/video-takeover-ad-specs/) |
| Programmatic companion (PMP / TTD) | 300 × 250 | 6:5 | Ad | [Sponsored Playlist ad specs – Spotify Advertising](https://ads.spotify.com/en-SG/ad-specs/sponsored-playlist-ad-specs/) |

### Substack

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Publication logo | 512 × 512 | 1:1 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication), [How do I set a custom theme for my Substack?](https://support.substack.com/hc/en-us/articles/360055169471-How-do-I-set-a-custom-theme-for-my-Substack) |
| Publication wordmark (header / nav bar) | 1344 × 256 | 21:4 | Organic | [How do I set a custom theme for my Substack?](https://support.substack.com/hc/en-us/articles/360055169471-How-do-I-set-a-custom-theme-for-my-Substack) |
| Publication cover image (welcome page) | 1200 × 1200 | 1:1 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication) |
| Email banner (header of publication emails) | 1100 × 220 | 5:1 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication), [How do I edit email headers and footers on Substack?](https://support.substack.com/hc/en-us/articles/360056142311-How-do-I-edit-email-headers-and-footers-on-Substack) |
| Post preview / thumbnail (social preview, homepage and Notes cards) | 1456 × 1040 | 14:10 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication) |
| Social preview, wide link card (official minimum) | 1200 × 630 | 1.91:1 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication) |
| Post header (full-width image at top of post) | 1456 × 816 | 16:9 | Organic | Unverified. [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication), [Substack Image Sizes: Header, Post, and Article Dimensions (imageresizers.net, third-party)](https://www.imageresizers.net/substack-image-sizes) |
| Full-width in-post image, tallest allowed | 1456 × 1456 | 1:1 | Organic | [What are the optimal image dimensions for my Substack publication?](https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication) |
| Podcast cover art | 3000 × 3000 | 1:1 | Organic | [What artwork appears for my Substack podcast?](https://support.substack.com/hc/en-us/articles/8503114939412-What-artwork-appears-for-my-Substack-podcast) |
| Podcast episode art | 3000 × 3000 | 1:1 | Organic | [What artwork appears for my Substack podcast?](https://support.substack.com/hc/en-us/articles/8503114939412-What-artwork-appears-for-my-Substack-podcast) |
| Video post | 1920 × 1080 | 16:9 | Organic | [Guide to video posts on Substack](https://support.substack.com/hc/en-us/articles/21093671091220) |
| Video post thumbnail | 1920 × 1080 | 16:9 | Organic | Unverified. [Guide to video posts on Substack](https://support.substack.com/hc/en-us/articles/21093671091220) |
| Notes image | 1080 × 1350 | 4:5 | Organic | Unverified. [Getting started on Substack Notes](https://support.substack.com/hc/en-us/articles/14564821756308-Getting-started-on-Substack-Notes) |
| Profile photo (author byline) | 400 × 400 | 1:1 | Organic | Unverified. [Substack Image Sizes 2026 (Pixel Image, third-party)](https://www.ppimage.com/blog/substack-image-size-guide) |

### Telegram

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Channel post | 1280 × 720 | 16:9 | Organic | see sources below |
| Channel post / album | 1080 × 1350 | 4:5 | Organic | see sources below |
| Channel story | 1080 × 1920 | 9:16 | Organic | see sources below |
| Channel avatar | 512 × 512 | 1:1 | Organic | see sources below |

Sources:

- [limits.tginfo.me: unofficial Telegram limits list](https://limits.tginfo.me)
- [Telegram Bot API (limits for text, captions, albums, polls, profile)](https://core.telegram.org/bots/api)
- [Telegram API: client configuration (live limits)](https://core.telegram.org/api/config)
- [Telegram Blog: Communities, Rich Text Editor, invisible messages](https://telegram.org/blog/communities-editor-invisible-messages)
- [Telegram Blog: watch apps and more (Bot API 10.1, Rich Messages)](https://telegram.org/blog/watch-apps-and-more)
- [Telegram Bot API changelog](https://core.telegram.org/bots/api-changelog)
- [Telegram Blog: direct messages to channels, HD photos, 12 poll options](https://telegram.org/blog/direct-to-channel-trim-voice-and-more)
- [Telegram Premium FAQ (file sizes, boost levels)](https://telegram.org/faq_premium)
- [Telegram Blog: AI editor and "Mighty Polls"](https://telegram.org/blog/ai-editor-mighty-polls-and-more)
- [Telegram Blog: Channel Stories](https://telegram.org/blog/channel-stories)
- [Telegram API: boosts](https://core.telegram.org/api/boost)
- [Telegram Blog: Live Stories, gift auctions, repeating messages](https://telegram.org/blog/live-stories-gift-auctions)
- [Telegram Blog: Channels 2.0 (silent posts, signatures)](https://telegram.org/blog/channels-2-0)
- [Telegram Channels FAQ](https://telegram.org/faq_channels)
- [Telegram Blog: checklists and suggested posts](https://telegram.org/blog/checklists-suggested-posts)
- [Telegram Blog: welcome messages, buttons in messages](https://telegram.org/blog/welcome-messages-buttons-TG-13)
- [Telegram Blog: new design and AI summaries](https://telegram.org/blog/new-design-ai-summaries)
- [Telegram API: channel statistics](https://core.telegram.org/api/stats)
- [Telegram Blog: monetization for channels](https://telegram.org/blog/monetization-for-channels)
- [Telegram API: message views (how views are counted)](https://core.telegram.org/api/views)

### Threads

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed ad | 1440 × 1440 | 1:1 | Ad | [Threads Ads Creation (Marketing API)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/threads-ads/creation), [Meta Ads Guide, Facebook Feed image specs](https://www.facebook.com/business/ads-guide/update/image) |
| Feed post (portrait) | 1080 × 1350 | 4:5 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed post (portrait, high-res) | 1440 × 1800 | 4:5 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed post (square) | 1080 × 1080 | 1:1 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed post (landscape) | 1440 × 754 | 1.91:1 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Carousel item | 1080 × 1350 | 4:5 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed video (vertical) | 1080 × 1920 | 9:16 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed video (portrait) | 1080 × 1350 | 4:5 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed video (square) | 1080 × 1080 | 1:1 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Feed video (landscape) | 1920 × 1080 | 16:9 | Organic | [Threads API Overview (image and video specifications, carousel limits)](https://developers.facebook.com/documentation/threads/overview) |
| Profile picture | 320 × 320 | 1:1 | Organic | Unverified. [Threads profile picture size (Moda, third-party)](https://moda.app/resources/sizes/threads-profile-picture) |
| Feed ad | 1080 × 1350 | 4:5 | Ad | [Threads Ads Creation (Marketing API)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/threads-ads/creation), [Extend Meta Campaigns With Ads in Threads](https://www.facebook.com/business/ads/threads) |
| Feed ad | 1080 × 1080 | 1:1 | Ad | [Threads Ads Creation (Marketing API)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/threads-ads/creation) |
| Feed ad | 1200 × 628 | 1.91:1 | Ad | [Threads Ads Creation (Marketing API)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/threads-ads/creation) |
| Carousel ad card | 1080 × 1080 | 1:1 | Ad | [Threads Ads Creation (Marketing API)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/threads-ads/creation) |

### TikTok

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed video (full screen) | 1080 × 1920 | 9:16 | Organic | Unverified. [TikTok Ads Help Center – Creative best practices for performance ads](https://ads.tiktok.com/help/article/creative-best-practices), [TikTok for Developers – Content Posting API, Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [AdKit – TikTok Ad Safe Zones (v2026-09-10)](https://adkit.so/tools/safe-zones/tiktok) |
| Feed video (landscape) | 1920 × 1080 | 16:9 | Organic | Unverified. [TikTok for Developers – Content Posting API, Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [Moda – TikTok sizes / thumbnail](https://moda.app/resources/sizes/tiktok-thumbnail) |
| Feed video (square) | 1080 × 1080 | 1:1 | Organic | Unverified. [TikTok for Developers – Content Posting API, Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [Moda – TikTok sizes / thumbnail](https://moda.app/resources/sizes/tiktok-thumbnail) |
| Photo mode carousel slide | 1080 × 1920 | 9:16 | Organic | Unverified. [TikTok for Developers – Content Posting API, Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [Kapwing – How to post photos and carousels on TikTok with Photo Mode](https://kapwing.com/resources/how-to-post-photos-and-carousels-on-tiktok-with-photo-mode) |
| Photo mode slide (portrait) | 1080 × 1440 | 3:4 | Organic | Unverified. [Kapwing – How to post photos and carousels on TikTok with Photo Mode](https://kapwing.com/resources/how-to-post-photos-and-carousels-on-tiktok-with-photo-mode), [TikTok Discover – How to get back the ratio on Photo Mode](https://www.tiktok.com/discover/how-to-get-back-the-ratio-on-photo-mode?lang=en) |
| Video cover / thumbnail | 1080 × 1920 | 9:16 | Organic | Unverified. [Moda – TikTok sizes / thumbnail](https://moda.app/resources/sizes/tiktok-thumbnail) |
| Profile photo | 400 × 400 | 1:1 | Organic | Unverified. [Socialsizes.io – TikTok profile picture size](https://socialsizes.io/tiktok-profile-picture-size/) |
| In-Feed video ad | 1080 × 1920 | 9:16 | Ad | Unverified. [TikTok Ads Help Center – Video ads specifications](https://ads.tiktok.com/help/article/video-ads-specifications), [AdKit – TikTok Ad Safe Zones (v2026-09-10)](https://adkit.so/tools/safe-zones/tiktok) |
| In-Feed video ad (square) | 1080 × 1080 | 1:1 | Ad | [TikTok Ads Help Center – Video ads specifications](https://ads.tiktok.com/help/article/video-ads-specifications) |
| In-Feed video ad (horizontal) | 1920 × 1080 | 16:9 | Ad | [TikTok Ads Help Center – Video ads specifications](https://ads.tiktok.com/help/article/video-ads-specifications) |
| TopView ad | 1080 × 1920 | 9:16 | Ad | Unverified. [TikTok Ads Help Center – TopView ad specifications (updated June 2026)](https://ads.tiktok.com/help/article/tiktok-reservation-topview?lang=en), [AdKit – TikTok Ad Safe Zones (v2026-09-10)](https://adkit.so/tools/safe-zones/tiktok) |
| Ad profile photo (non-Spark) | 98 × 98 | 1:1 | Ad | [TikTok Ads Help Center – Video ads specifications](https://ads.tiktok.com/help/article/video-ads-specifications), [TikTok Ads Help Center – TopView ad specifications (updated June 2026)](https://ads.tiktok.com/help/article/tiktok-reservation-topview?lang=en) |
| Carousel ad / Ad Network image ad (vertical) | 720 × 1280 | 9:16 | Ad | [TikTok Ads Help Center – Specifications for Carousel Ads (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-carousel-ads?lang=en), [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| Carousel ad / Ad Network image ad (square) | 640 × 640 | 1:1 | Ad | [TikTok Ads Help Center – Specifications for Carousel Ads (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-carousel-ads?lang=en), [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| Carousel ad / Ad Network image ad (horizontal) | 1200 × 628 | 1.91:1 | Ad | [TikTok Ads Help Center – Specifications for Carousel Ads (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-carousel-ads?lang=en), [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network video (vertical) | 720 × 1280 | 9:16 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network video (landscape) | 1280 × 720 | 16:9 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network video (square) | 720 × 720 | 1:1 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network banner (medium) | 600 × 500 | 6:5 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network banner (large) | 640 × 200 | 16:5 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |
| TikTok Ad Network banner (small) | 640 × 100 | 32:5 | Ad | [TikTok Ads Help Center – Specifications for TikTok Ad Network (Pangle) ad assets (updated September 2026)](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets?lang=en) |

### Tumblr

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Photo post (dashboard) | 540 × 810 | 2:3 | Organic | [Image & GIF troubleshooting (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/image-gif-troubleshooting/) |
| Photo post, click-through (large) version | 2048 × 3072 | 2:3 | Organic | [Image & GIF troubleshooting (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/image-gif-troubleshooting/) |
| Animated GIF post | 540 × 540 | 1:1 | Organic | [Image & GIF troubleshooting (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/image-gif-troubleshooting/) |
| Video post | 1280 × 720 | 16:9 | Organic | [Posting video (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/posting-video/) |
| Video post, vertical | 720 × 1280 | 9:16 | Organic | [Posting video (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/posting-video/) |
| Blog header image | 2048 × 1152 | 16:9 | Organic | [Changing Your Blog's Appearance (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/appearance-options/) |
| Avatar / profile picture | 128 × 128 | 1:1 | Organic | [Changing Your Blog's Appearance (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/appearance-options/) |
| Blaze promoted post | 540 × 810 | 2:3 | Ad | [Blaze (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/blaze/), [Image & GIF troubleshooting (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/image-gif-troubleshooting/) |
| Blaze promoted video post | 1280 × 720 | 16:9 | Ad | [Blaze (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/blaze/), [Posting video (Tumblr Help Center)](https://help.tumblr.com/knowledge-base/posting-video/) |

### Twitch

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile picture | 256 × 256 | 1:1 | Organic | Unverified. [Twitch Help: Channel Page Setup](https://help.twitch.tv/s/article/channel-page-setup), [Streamlabs: Twitch size guide (third-party)](https://streamlabs.com/content-hub/post/twitch-size-guide-panel-sizes-profile-picture-guide-and-more) |
| Profile banner (channel header) | 1200 × 480 | 5:2 | Organic | [Twitch Help: Channel Page Setup](https://help.twitch.tv/s/article/channel-page-setup) |
| Video player banner (offline screen) | 1920 × 1080 | 16:9 | Organic | Unverified. [Twitch Help: Channel Page Setup](https://help.twitch.tv/s/article/channel-page-setup), [Streamlabs: Twitch size guide (third-party)](https://streamlabs.com/content-hub/post/twitch-size-guide-panel-sizes-profile-picture-guide-and-more) |
| About panel (info panel) | 320 × 160 | 2:1 | Organic | [Twitch Help: How to Edit Info Panels](https://help.twitch.tv/s/article/how-to-edit-info-panels), [Twitch Help: Channel Page Setup](https://help.twitch.tv/s/article/channel-page-setup) |
| Emote (auto-resize upload) | 112 × 112 | 1:1 | Organic | [Twitch Help: Emote Formatting & Instant Emote Upload Requirements](https://help.twitch.tv/s/article/emote-guidelines) |
| Emote (manual, small) | 28 × 28 | 1:1 | Organic | [Twitch Help: Emote Formatting & Instant Emote Upload Requirements](https://help.twitch.tv/s/article/emote-guidelines) |
| Emote (manual, medium) | 56 × 56 | 1:1 | Organic | [Twitch Help: Emote Formatting & Instant Emote Upload Requirements](https://help.twitch.tv/s/article/emote-guidelines) |
| Subscriber / Bits badge (large) | 72 × 72 | 1:1 | Organic | [Twitch Help: Subscriber Badge Guide](https://help.twitch.tv/s/article/subscriber-badge-guide) |
| Subscriber / Bits badge (medium) | 36 × 36 | 1:1 | Organic | [Twitch Help: Subscriber Badge Guide](https://help.twitch.tv/s/article/subscriber-badge-guide) |
| Subscriber / Bits badge (chat) | 18 × 18 | 1:1 | Organic | [Twitch Help: Subscriber Badge Guide](https://help.twitch.tv/s/article/subscriber-badge-guide) |
| Channel points icon | 72 × 72 | 1:1 | Organic | Unverified. [Streamlabs: Twitch size guide (third-party)](https://streamlabs.com/content-hub/post/twitch-size-guide-panel-sizes-profile-picture-guide-and-more) |
| Stream overlay / scene canvas (1080p) | 1920 × 1080 | 16:9 | Organic | [Twitch Help: Broadcasting Guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines) |
| Stream overlay (2K / Enhanced Broadcasting) | 2560 × 1440 | 16:9 | Organic | [Twitch Help: Dual Format Vertical Video](https://help.twitch.tv/s/article/dual-format-vertical-video) |
| Vertical stream canvas (Dual Format) | 1080 × 1920 | 9:16 | Organic | [Twitch Help: Dual Format Vertical Video](https://help.twitch.tv/s/article/dual-format-vertical-video) |
| Channel trailer | 1920 × 1080 | 16:9 | Organic | [Twitch Help: Channel Page Setup](https://help.twitch.tv/s/article/channel-page-setup) |
| Category box art | 285 × 380 | 3:4 | Organic | Unverified. [Elgato: Twitch Graphics Size Guide (third-party)](https://marketplace.elgato.com/learn/how-to/twitch-graphics-size-guide) |
| Premium video ad | 1920 × 1080 | 16:9 | Ad | [Amazon Ads: Twitch Premium Video specs](https://advertising.amazon.com/resources/ad-specs/twitch/premium-video) |
| Vertical video ad | 1080 × 1920 | 9:16 | Ad | [Amazon Ads: Twitch Vertical Video Ads specs](https://advertising.amazon.com/resources/ad-specs/twitch/twitch-vertical-video-ads) |
| Mid-feed ad (mobile) | 1080 × 1920 | 9:16 | Ad | [Amazon Ads: Twitch Mid-feed Ads specs](https://advertising.amazon.com/resources/ad-specs/twitch/mid-feed-ads) |
| Homepage Headliner, left/right unit (desktop) | 450 × 350 | 9:7 | Ad | [Amazon Ads: Twitch Homepage Headliner specs](https://advertising.amazon.com/resources/ad-specs/twitch/homepage-headliner) |
| Homepage Headliner, full-screen feed unit (mobile) | 1080 × 1920 | 9:16 | Ad | [Amazon Ads: Twitch Homepage Headliner specs](https://advertising.amazon.com/resources/ad-specs/twitch/homepage-headliner) |
| Homepage Headliner, Following tab banner (mobile) | 640 × 100 | 32:5 | Ad | [Amazon Ads: Twitch Homepage Headliner specs](https://advertising.amazon.com/resources/ad-specs/twitch/homepage-headliner) |
| Super Leaderboard | 728 × 90 | 728:90 | Ad | [Amazon Ads: Twitch Super Leaderboard specs](https://advertising.amazon.com/resources/ad-specs/twitch/super-leaderboard) |
| Medium Rectangle | 300 × 250 | 6:5 | Ad | [Amazon Ads: Twitch Medium Rectangle specs](https://advertising.amazon.com/resources/ad-specs/twitch/medium-rectangle) |
| In-stream display skyscraper | 160 × 600 | 4:15 | Ad | [Amazon Ads: Twitch In-stream Display Ads specs](https://advertising.amazon.com/resources/ad-specs/twitch/stream-display-ads) |
| In-stream display bottom banner (mobile) | 320 × 50 | 32:5 | Ad | [Amazon Ads: Twitch In-stream Display Ads specs](https://advertising.amazon.com/resources/ad-specs/twitch/stream-display-ads) |

### Viber

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Channel / bot account icon (avatar) | 720 × 720 | 1:1 | Organic | [Viber REST Bot API (sender avatar, thumbnails, get_account_info icon/background)](https://developers.viber.com/docs/api/rest-bot-api/) |
| Bot message sender avatar | 720 × 720 | 1:1 | Organic | [Viber REST Bot API (sender avatar, thumbnails, get_account_info icon/background)](https://developers.viber.com/docs/api/rest-bot-api/) |
| Channel / community chat background | 1080 × 1920 | 9:16 | Organic | [Viber REST Bot API (sender avatar, thumbnails, get_account_info icon/background)](https://developers.viber.com/docs/api/rest-bot-api/) |
| Channel post picture | 1080 × 1080 | 1:1 | Organic | [Viber Channels Post API](https://developers.viber.com/docs/tools/channels-post-api/) |
| Picture / video message thumbnail | 400 × 400 | 1:1 | Organic | [Viber REST Bot API (sender avatar, thumbnails, get_account_info icon/background)](https://developers.viber.com/docs/api/rest-bot-api/), [Viber Channels Post API](https://developers.viber.com/docs/tools/channels-post-api/) |
| Channel post video | 1080 × 1920 | 9:16 | Organic | [Viber Channels Post API](https://developers.viber.com/docs/tools/channels-post-api/) |
| Business message image (rich media) | 800 × 800 | 1:1 | Ad | Unverified. [Infobip, Viber Business Messages message types](https://www.infobip.com/docs/viber/business-messages/message-types) |
| Business message video thumbnail | 800 × 800 | 1:1 | Ad | Unverified. [Infobip, Viber Business Messages message types](https://www.infobip.com/docs/viber/business-messages/message-types) |
| Business message carousel card | 696 × 600 | 1.16:1 | Ad | Unverified. [Infobip, Viber Business Messages message types](https://www.infobip.com/docs/viber/business-messages/message-types), [Apifon, Viber carousel](https://kb.apifon.com/viber-carousel) |
| Sticker (custom pack) | 490 × 490 | 1:1 | Organic | Unverified. [sticker-convert compression presets (viber)](https://github.com/laggykiller/sticker-convert/blob/master/src/sticker_convert/resources/compression.json), [Viber blog, Create your own stickers (2019-09-16)](https://www.viber.com/?p=28682) |
| Native ad image, Android (Calls tab, More screen, Post-call) | 300 × 250 | 6:5 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native) |
| Native ad image, iOS (Calls tab, More screen, Post-call, Chat extensions) | 200 × 200 | 1:1 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native), [Admixer, Viber Chat Extensions (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Chat-Extensions) |
| Native ad icon, Android | 60 × 60 | 1:1 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native) |
| Native ad icon, iOS | 50 × 50 | 1:1 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native), [Admixer, Viber Chat Extensions (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Chat-Extensions) |
| Native ad image (programmatic deal) | 1200 × 627 | 1.91:1 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native) |
| Native ad image (programmatic deal) | 600 × 600 | 1:1 | Ad | Unverified. [Admixer, Viber Post Call Native (updated 2026-08-19)](https://helpcenter.admixer.com/overview/Post-Call-Native), [Admixer, Viber Calls Tab Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/Calls-Tab-Native), [Admixer, Viber More Screen Native (updated 2026-08-18)](https://helpcenter.admixer.com/overview/More-Screen-Native) |
| Main chat screen native ad image | 1000 × 1000 | 1:1 | Ad | Unverified. [Admixer, Viber Main Chat Screen (search excerpt; page now 404)](https://helpcenter.admixer.com/overview/viber-main-chat-screen), [Messaggio, Viber Ads deck (2021)](https://messaggio.com/wp-content/uploads/2022/07/Messaggio-Viber-Ads_ENG-2021.pdf) |
| Main chat screen banner | 320 × 50 | 32:5 | Ad | Unverified. [Admixer, Viber Main Chat Screen (search excerpt; page now 404)](https://helpcenter.admixer.com/overview/viber-main-chat-screen) |
| Display / post-call banner | 300 × 250 | 6:5 | Ad | Unverified. [Messaggio, Viber Ads deck (2021)](https://messaggio.com/wp-content/uploads/2022/07/Messaggio-Viber-Ads_ENG-2021.pdf) |

### Vimeo

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Video (1080p HD) | 1920 × 1080 | 16:9 | Organic | [Video compression settings (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings) |
| Video (720p HD) | 1280 × 720 | 16:9 | Organic | [Video compression settings (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings) |
| Video (2K) | 2560 × 1440 | 16:9 | Organic | [Video compression settings (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings) |
| Video (4K UHD) | 3840 × 2160 | 16:9 | Organic | [Video compression settings (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings) |
| Video (SD 4:3) | 640 × 480 | 4:3 | Organic | [Video compression settings (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings) |
| Vertical video | 1080 × 1920 | 9:16 | Organic | [Create a mobile first classic interactive video (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426852655889-Create-a-mobile-first-classic-interactive-video) |
| Video thumbnail | 1920 × 1080 | 16:9 | Organic | [How to change the thumbnail image for my video (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426471350289-How-do-I-change-the-thumbnail-image-for-my-Create-video-) |
| Vertical video thumbnail | 1080 × 1920 | 9:16 | Organic | [How to change the thumbnail image for my video (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426471350289-How-do-I-change-the-thumbnail-image-for-my-Create-video-) |
| Profile picture | 600 × 600 | 1:1 | Organic | [About managing your Vimeo profile page (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12425669540113) |
| Profile cover video (banner) | 1920 × 540 | 32:9 | Organic | [About managing your Vimeo profile page (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12425669540113) |
| Channel header image | 1920 × 540 | 32:9 | Organic | Unverified. [Channels (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426200314513-Channels) |
| Showcase featured banner | 1920 × 1080 | 16:9 | Organic | Unverified. [How to customize my showcase (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/15004774103953-How-to-customize-my-showcase) |
| End screen custom/background image | 1920 × 1080 | 16:9 | Organic | Unverified. [About end screens (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426231346449-About-end-screens) |
| Live event logo overlay | 200 × 200 | 1:1 | Organic | [How to add logo graphic overlays to events (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/12426961777553) |
| OTT primary thumbnail | 3840 × 2160 | 16:9 | Organic | [About thumbnail options for your Vimeo OTT videos (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/46427320531217-About-thumbnail-options-for-your-Vimeo-OTT-videos) |
| OTT vertical key art | 4000 × 6000 | 2:3 | Organic | [About thumbnail options for your Vimeo OTT videos (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/46427320531217-About-thumbnail-options-for-your-Vimeo-OTT-videos) |
| OTT square key art | 6000 × 6000 | 1:1 | Organic | [About thumbnail options for your Vimeo OTT videos (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/46427320531217-About-thumbnail-options-for-your-Vimeo-OTT-videos) |
| OTT featured carousel (wide) | 3840 × 1440 | 8:3 | Organic | [About thumbnail options for your Vimeo OTT videos (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/46427320531217-About-thumbnail-options-for-your-Vimeo-OTT-videos) |
| OTT featured carousel (mobile) | 3000 × 2625 | 8:7 | Organic | [About thumbnail options for your Vimeo OTT videos (Vimeo Help Center)](https://help.vimeo.com/hc/en-us/articles/46427320531217-About-thumbnail-options-for-your-Vimeo-OTT-videos) |

### WhatsApp

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Status (photo) | 1080 × 1920 | 9:16 | Organic | Unverified. [WhatsApp Help Center, About status](https://faq.whatsapp.com/454876960047011), [(U) Chatarmin, WhatsApp image size guide](https://chatarmin.com/en/blog/whats-app-image-size-guide) |
| Status (video) | 1080 × 1920 | 9:16 | Organic | Unverified. [WhatsApp Help Center, About status](https://faq.whatsapp.com/454876960047011), [(U) Chatarmin, WhatsApp image size guide](https://chatarmin.com/en/blog/whats-app-image-size-guide) |
| Channels post (image) | 1080 × 1080 | 1:1 | Organic | Unverified. [(U) Chatarmin, WhatsApp image size guide](https://chatarmin.com/en/blog/whats-app-image-size-guide) |
| Profile / business profile photo | 640 × 640 | 1:1 | Organic | Unverified. [Meta for Developers, WhatsApp Business API, Profile photo settings](https://developers.facebook.com/docs/whatsapp/on-premises/reference/settings/profile/photo) |
| Channel profile photo | 640 × 640 | 1:1 | Organic | Unverified. [Meta for Developers, WhatsApp Business API, Profile photo settings](https://developers.facebook.com/docs/whatsapp/on-premises/reference/settings/profile/photo), [(U) Chatarmin, WhatsApp image size guide](https://chatarmin.com/en/blog/whats-app-image-size-guide) |
| Business profile cover photo | 1211 × 681 | 16:9 | Organic | Unverified. [(U) Aiarty, WhatsApp Business cover photo size](https://www.aiarty.com/knowledge-base/whatsapp-business-cover-photo-size.htm) |
| Catalogue product/service image | 1024 × 1024 | 1:1 | Organic | [Meta Business Help Centre, Product image specifications for catalogues](https://en-gb.facebook.com/business/help/686259348512056), [WhatsApp Help Center, How to create and maintain a catalog](https://faq.whatsapp.com/833697274483076/?cms_platform=web) |
| Sticker | 512 × 512 | 1:1 | Organic | [WhatsApp, stickers repository README (sticker requirements)](https://github.com/WhatsApp/stickers/blob/main/Android/README.md) |
| Sticker pack tray icon | 96 × 96 | 1:1 | Organic | [WhatsApp, stickers repository README (sticker requirements)](https://github.com/WhatsApp/stickers/blob/main/Android/README.md) |
| Link preview (og:image) | 1200 × 630 | 1.91:1 | Organic | Unverified. [(U) Wix Help Center, Recommended og:image size](https://support.wix.com/en/article/wix-editor-recommended-ogimage-size) |
| Status ad (Updates tab) | 1440 × 2560 | 9:16 | Ad | [Meta for Developers, Ads in WhatsApp Status](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-in-whatsapp-status), [Meta Ads Guide, Instagram Stories image and video specs](https://www.facebook.com/business/ads-guide/update/image/instagram-story) |
| Click-to-WhatsApp ad, feed | 1440 × 1800 | 4:5 | Ad | [Meta Ads Guide, Facebook Feed image specs](https://www.facebook.com/business/ads-guide/update/image) |
| Click-to-WhatsApp ad, square | 1080 × 1080 | 1:1 | Ad | [Meta Ads Guide, Facebook Feed image specs](https://www.facebook.com/business/ads-guide/update/image), [Meta Ads Guide, Facebook Feed carousel specs](https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed) |
| Click-to-WhatsApp ad, carousel card | 1080 × 1080 | 1:1 | Ad | [Meta Ads Guide, Facebook Feed carousel specs](https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed) |
| Click-to-WhatsApp ad, Stories/Reels | 1440 × 2560 | 9:16 | Ad | [Meta Ads Guide, Instagram Stories image and video specs](https://www.facebook.com/business/ads-guide/update/image/instagram-story) |

### X

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Timeline | 1200 × 675 | 16:9 | Organic | see sources below |
| Timeline | 1080 × 1350 | 4:5 | Organic | see sources below |
| Timeline | 1080 × 1440 | 3:4 | Organic | see sources below |
| Timeline | 1080 × 1080 | 1:1 | Organic | see sources below |
| Timeline / full-screen viewer | 1080 × 1920 | 9:16 | Organic | see sources below |
| Timeline | 1920 × 1080 | 16:9 | Organic | see sources below |
| Link card (OG) | 1200 × 600 | 2:1 | Organic | see sources below |
| Profile | 400 × 400 | 1:1 | Organic | see sources below |
| Header | 1500 × 500 | 3:1 | Organic | see sources below |
| Image / video ad | 1200 × 1200 | 1:1 | Ad | see sources below |
| Image ad | 1200 × 628 | 1.91:1 | Ad | see sources below |
| Image / video ad | 1440 × 1800 | 4:5 | Ad | see sources below |
| Image / video ad | 1080 × 1620 | 2:3 | Ad | see sources below |
| Vertical video | 1080 × 1920 | 9:16 | Ad | see sources below |
| Website / app card, carousel card | 800 × 418 | 1.91:1 | Ad | see sources below |
| Card / carousel card | 800 × 800 | 1:1 | Ad | see sources below |
| Video card | 800 × 450 | 16:9 | Ad | see sources below |
| Explore takeover | 1280 × 720 | 16:9 | Ad | see sources below |

Sources:

- [X Help: posting GIFs and pictures (2:1–3:4 uncropped, 5 MB)](https://help.x.com/en/using-x/posting-gifs-and-pictures)
- [X Developer (archived): summary card with large image](https://web.archive.org/web/20260112050218/https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image)
- [X Business: creative ad specifications](https://business.x.com/en/help/campaign-setup/creative-ad-specifications)
- [X Business: legacy ad specs (Collection ads)](https://business.x.com/en/help/campaign-setup/creative-ad-specifications-old)
- [X Business: expanded aspect ratios for ad creatives (4:5, 2:3)](https://business.x.com/en/blog/x-expands-aspect-ratio-support-for-ad-creatives-replacement)

### XING

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile photo (member) | 1024 × 1024 | 1:1 | Organic | [XING Help Center – Upload, modify or delete my profile photo](https://help.xing.com/hc/en-us/articles/31499187723805-Upload-modify-or-delete-my-profile-photo) |
| Profile cover image (Premium members) | 1280 × 624 |  | Organic | [XING Help Center – Adding a cover image](https://help.xing.com/hc/en-us/articles/31499254575261-Adding-a-cover-image) |
| Company page / employer profile logo | 300 × 300 | 1:1 | Organic | [XING Help Center – Use of images and videos (employer branding profile)](https://help.xing.com/hc/en-us/articles/31499280533661-Use-of-images-and-videos), [XING Help Center – Set up the Employer Branding Profile on XING](https://help.xing.com/hc/en-us/articles/31499177619869-Set-up-the-Employer-Branding-Profile-on-XING) |
| Company page header / title image | 1280 × 720 | 16:9 | Organic | [XING Help Center – Use of images and videos (employer branding profile)](https://help.xing.com/hc/en-us/articles/31499280533661-Use-of-images-and-videos), [XING Help Center – Set up the Employer Branding Profile on XING](https://help.xing.com/hc/en-us/articles/31499177619869-Set-up-the-Employer-Branding-Profile-on-XING) |
| Company page gallery ("Impressions") image | 1280 × 720 | 16:9 | Organic | [XING Help Center – Use of images and videos (employer branding profile)](https://help.xing.com/hc/en-us/articles/31499280533661-Use-of-images-and-videos), [XING Help Center – Set up the Employer Branding Profile on XING](https://help.xing.com/hc/en-us/articles/31499177619869-Set-up-the-Employer-Branding-Profile-on-XING) |
| Company page gallery video | 1920 × 1080 | 16:9 | Organic | [XING Help Center – Use of images and videos (employer branding profile)](https://help.xing.com/hc/en-us/articles/31499280533661-Use-of-images-and-videos), [XING Help Center – Set up the Employer Branding Profile on XING](https://help.xing.com/hc/en-us/articles/31499177619869-Set-up-the-Employer-Branding-Profile-on-XING) |
| Company page video thumbnail | 1280 × 720 | 16:9 | Organic | [XING Help Center – Use of images and videos (employer branding profile)](https://help.xing.com/hc/en-us/articles/31499280533661-Use-of-images-and-videos) |
| Company page news post image | 1920 × 1080 | 16:9 | Organic | [XING Help Center – Write and publish an article in the news section](https://help.xing.com/hc/en-us/articles/31499163715997-Write-and-publish-an-article-in-the-news-section) |
| Company page news post video | 1920 × 1080 | 16:9 | Organic | [XING Help Center – Write and publish an article in the news section](https://help.xing.com/hc/en-us/articles/31499163715997-Write-and-publish-an-article-in-the-news-section) |
| XING Ads (AdManager), landscape image | 1200 × 675 | 16:9 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Ads (AdManager), square image | 1080 × 1080 | 1:1 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Lead Ads image (ad and lead form) | 1200 × 612 | 1.96:1 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Video Ads | 1920 × 1080 | 16:9 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Content Ads (industry newsletter), desktop | 500 × 288 | 16:9 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Content Ads (industry newsletter), mobile | 1160 × 652 | 16:9 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Mailings key visual / header | 1800 × 1200 | 3:2 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |
| XING Mailings module image | 600 × 400 | 3:2 | Ad | [XING Marketing Solutions – Specifications for XING ad formats](https://werben.xing.com/en/knowledge-cases/specifications-for-xing-ads) |

### YouTube

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Video thumbnail | 3840 × 2160 | 16:9 | Organic | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431) |
| Video thumbnail (classic) | 1280 × 720 | 16:9 | Organic | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431), [Google Ads Help: About video ad specs](https://support.google.com/google-ads/answer/13547298) |
| Shorts thumbnail | 2160 × 3840 | 9:16 | Organic | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf) |
| Podcast playlist thumbnail | 1280 × 1280 | 1:1 | Organic | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431) |
| Long-form video | 1920 × 1080 | 16:9 | Organic | [YouTube Help: Recommended upload encoding settings](https://support.google.com/youtube/answer/1722171), [YouTube Help: Video resolution & aspect ratios](https://support.google.com/youtube/answer/6375112) |
| Long-form video 4K | 3840 × 2160 | 16:9 | Organic | [YouTube Help: Video resolution & aspect ratios](https://support.google.com/youtube/answer/6375112) |
| Shorts video | 1080 × 1920 | 9:16 | Organic | [YouTube Help: Get started creating YouTube Shorts](https://support.google.com/youtube/answer/10059070), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf) |
| Channel banner | 2560 × 1440 | 16:9 | Organic | [YouTube Help: Manage your channel branding](https://support.google.com/youtube/answer/10456525) |
| Profile picture | 800 × 800 | 1:1 | Organic | [YouTube Help: Manage your channel branding](https://support.google.com/youtube/answer/10456525) |
| Video watermark (branding) | 150 × 150 | 1:1 | Organic | [YouTube Help: Manage your channel branding](https://support.google.com/youtube/answer/10456525) |
| Post (community) image | 1080 × 1080 | 1:1 | Organic | [YouTube Help: Create a post](https://support.google.com/youtube/answer/7124474) |
| End screen (video frame) | 1920 × 1080 | 16:9 | Organic | [YouTube Help: Add end screens to videos](https://support.google.com/youtube/answer/6388789) |
| End screen custom image element | 300 × 300 | 1:1 | Organic | [YouTube Help: Add end screens to videos](https://support.google.com/youtube/answer/6388789) |
| In-stream / bumper / in-feed video ad | 1920 × 1080 | 16:9 | Ad | [Google Ads Help: Video ads specs and format requirements](https://support.google.com/google-ads/answer/17091270), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf) |
| Shorts / vertical video ad | 1080 × 1920 | 9:16 | Ad | [Google Ads Help: Video ads specs and format requirements](https://support.google.com/google-ads/answer/17091270), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf), [Google Ads Help: YouTube Shorts ads asset specs and best practices](https://support.google.com/google-ads/answer/16041697) |
| Square video ad | 1080 × 1080 | 1:1 | Ad | [Google Ads Help: Video ads specs and format requirements](https://support.google.com/google-ads/answer/17091270), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf) |
| Portrait video ad (Demand Gen) | 1080 × 1350 | 4:5 | Ad | [Google Ads Help: Video asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17141078) |
| Masthead video | 1920 × 1080 | 16:9 | Ad | [Google Ads Help: Video ads specs and format requirements](https://support.google.com/google-ads/answer/17091270) |
| Demand Gen image | 1200 × 628 | 1.91:1 | Ad | [Google Ads Help: Image asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image | 1200 × 1200 | 1:1 | Ad | [Google Ads Help: Image asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image | 960 × 1200 | 4:5 | Ad | [Google Ads Help: Image asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image (Shorts) | 1080 × 1920 | 9:16 | Ad | [Google Ads Help: Image asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17140672), [YouTube: Universal Video Ad Safe Zones (PDF)](https://services.google.com/fh/files/misc/universalsafezones-youtube.pdf) |
| Ad logo | 1200 × 1200 | 1:1 | Ad | [Google Ads Help: Image asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17140672) |
| Companion banner | 300 × 60 | 5:1 | Ad | [Google Ads Help: Video ads specs and format requirements](https://support.google.com/google-ads/answer/17091270), [Google Ads Help: About video ad specs](https://support.google.com/google-ads/answer/13547298) |

## Video calls and chat

### Google Meet

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Custom call background (user upload) | 1920 × 1080 | 16:9 | Organic | [Change your background on Google Meet (Google Meet Help)](https://support.google.com/meet/answer/10058482), [Control backgrounds & special effects for Google Meet users (Google Workspace Admin Help)](https://knowledge.workspace.google.com/admin/meet/control-backgrounds-and-special-effects-for-google-meet-users) |
| Workspace admin-provided background | 1920 × 1080 | 16:9 | Organic | [Control backgrounds & special effects for Google Meet users (Google Workspace Admin Help)](https://knowledge.workspace.google.com/admin/meet/control-backgrounds-and-special-effects-for-google-meet-users) |
| Meet hardware (room device) home screen wallpaper | 1920 × 1080 | 16:9 | Organic | [Manage wallpapers & home screen theme (Google Meet hardware Admin Help)](https://knowledge.workspace.google.com/admin/meet-hardware/manage-wallpapers-and-home-screen-theme) |
| Profile photo (Google Account avatar shown in tiles when the camera is off) | 720 × 720 | 1:1 | Organic | Unverified. [Change your Gmail profile picture (Gmail Help; crop only, no size given)](https://support.google.com/mail/answer/35529), [Google Profile Picture Size Guide (CapCut, third-party)](https://www.capcut.com/resource/google-profile-picture-size) |

### Microsoft Teams

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Custom meeting background (user upload) | 1920 × 1080 | 16:9 | Organic | Unverified. [Change your background in Microsoft Teams meetings (Microsoft Support)](https://support.microsoft.com/en-us/office/change-your-background-in-microsoft-teams-meetings-f77a2381-443a-499d-825e-509a140f4780), [Teams background size (F1 Group blog, third-party)](https://www.f1group.com/2026/04/29/teams-background-size/) |
| Organization meeting background (Teams Premium) | 1920 × 1080 | 16:9 | Organic | [Manage and create custom meeting backgrounds for Teams meetings (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/custom-meeting-backgrounds) |
| Meeting theme image (pre-join and lobby, Teams Premium) | 1440 × 810 | 16:9 | Organic | [Create and manage meeting themes for Teams meetings (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/meeting-themes) |
| Meeting theme logo (invite, pre-join and lobby, Teams Premium) | 800 × 800 | 1:1 | Organic | [Create and manage meeting themes for Teams meetings (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/meeting-themes) |
| Branded meeting reaction, static (Teams Premium) | 100 × 100 | 1:1 | Organic | [Create and manage meeting themes for Teams meetings (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/meeting-themes) |
| Branded meeting reaction, animated sprite (Teams Premium) | 100 × 5100 | 1:51 | Organic | [Create and manage meeting themes for Teams meetings (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/meeting-themes) |
| Meeting invitation logo (admin) | 188 × 30 | 94:15 | Organic | [Customize meeting invitations (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/customize-meeting-invitations) |
| Town hall banner (emails) | 920 × 230 | 4:1 | Organic | [Customize a town hall in Microsoft Teams (Microsoft Support)](https://support.microsoft.com/en-us/teams/meetings/customize-a-town-hall-in-microsoft-teams) |
| Town hall logo | 280 × 280 | 1:1 | Organic | [Customize a town hall in Microsoft Teams (Microsoft Support)](https://support.microsoft.com/en-us/teams/meetings/customize-a-town-hall-in-microsoft-teams) |
| Webinar banner (registration page and emails) | 920 × 230 | 4:1 | Organic | [Customize a webinar in Microsoft Teams (Microsoft Support)](https://support.microsoft.com/en-us/office/customize-a-webinar-in-microsoft-teams-20491c28-863f-479b-8f61-85046d124f10) |
| Webinar logo | 280 × 280 | 1:1 | Organic | [Customize a webinar in Microsoft Teams (Microsoft Support)](https://support.microsoft.com/en-us/office/customize-a-webinar-in-microsoft-teams-20491c28-863f-479b-8f61-85046d124f10) |
| Profile picture | 648 × 648 | 1:1 | Organic | [Get profilePhoto, supported HD photo sizes (Microsoft Graph, Microsoft Learn)](https://learn.microsoft.com/en-us/graph/api/profilephoto-get) |
| Team / group picture | 648 × 648 | 1:1 | Organic | [Get profilePhoto, supported HD photo sizes (Microsoft Graph, Microsoft Learn)](https://learn.microsoft.com/en-us/graph/api/profilephoto-get) |
| Teams app color icon (store, app bar flyouts) | 192 × 192 | 1:1 | Organic | [Design app icon for Teams Store (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-icon-store-appbar) |
| Teams app outline (rest) icon, app bar | 32 × 32 | 1:1 | Organic | [Design app icon for Teams Store (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-icon-store-appbar) |
| Teams Store listing screenshot | 1366 × 768 | 683:384 | Organic | [Prepare for Teams Store submission (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/submission-checklist) |

### Slack

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Profile photo | 1024 × 1024 | 1:1 | Organic | [Slack Help: Upload a profile photo](https://slack.com/help/articles/115005506003-Upload-a-profile-photo) |
| Workspace icon | 512 × 512 | 1:1 | Organic | Unverified. [Slack Help: Upload a Slack icon](https://slack.com/help/articles/204379773-Upload-a-Slack-icon) |
| Custom emoji | 128 × 128 | 1:1 | Organic | Unverified. [Slack Help: Add custom emoji and aliases to your workspace](https://slack.com/help/articles/206870177-Add-custom-emoji-and-aliases-to-your-workspace) |
| App icon (app settings, Marketplace) | 1024 × 1024 | 1:1 | Organic | [Slack Developer Docs: apps.icon.set method](https://docs.slack.dev/reference/methods/apps.icon.set/) |
| Marketplace listing image / screenshot | 1600 × 1000 | 8:5 | Organic | [Slack Developer Docs: Submission guidelines and requirements (Slack Marketplace)](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements) |
| Link preview image (og:image) | 1200 × 630 | 1.91:1 | Organic | Unverified. [Slack Developer Docs: Block Kit image block (formats) and link unfurling](https://docs.slack.dev/reference/block-kit/blocks/image-block/) |
| Huddle video background | 1920 × 1080 | 16:9 | Organic | Unverified. [Slack Help: Use huddles in Slack](https://slack.com/help/articles/4402059023635) |

### Zoom

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Virtual background (meetings) | 1920 × 1080 | 16:9 | Organic | [Changing your virtual background image (KB0060387)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060387) |
| Profile picture | 1080 × 1080 | 1:1 | Organic | Unverified. [Managing your profile picture on the Zoom web portal (KB0064565)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064565) |
| Meeting wallpaper | 1920 × 1080 | 16:9 | Organic | [Enabling and managing meeting wallpapers (KB0075092)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0075092) |
| Webinar session branding wallpaper | 1920 × 1080 | 16:9 | Organic | [Using webinar session branding (KB0059384)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059384) |
| Webinar panelist virtual background | 1920 × 1080 | 16:9 | Organic | [Using webinar session branding (KB0059384)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059384) |
| Webinar invitation/registration banner | 640 × 200 | 16:5 | Organic | [Customizing webinar branding settings (KB0063298)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063298) |
| Webinar invitation/registration logo | 200 × 200 | 1:1 | Organic | [Customizing webinar branding settings (KB0063298)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063298) |
| Webinars Plus event page background | 1920 × 1080 | 16:9 | Organic | [Managing Zoom Webinars Plus Event Branding (KB0058273)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058273) |
| Meeting waiting room logo | 400 × 400 | 1:1 | Organic | [Enabling and customizing the waiting room (KB0059359)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059359) |
| Meeting waiting room image | 1920 × 960 | 2:1 | Organic | [Enabling and customizing the waiting room (KB0059359)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059359) |
| Meeting waiting room video | 1920 × 1080 | 16:9 | Organic | [Enabling and customizing the waiting room (KB0059359)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059359) |
| Zoom Events waiting room image | 1920 × 960 | 2:1 | Organic | [Managing Zoom Events waiting room settings (KB0074569)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0074569) |
| Zoom Events waiting room logo | 400 × 400 | 1:1 | Organic | [Managing Zoom Events waiting room settings (KB0074569)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0074569) |
| Zoom Events hub profile image | 160 × 160 | 1:1 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events event listing logo | 300 × 56 | 75:14 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events event listing masthead | 744 × 484 | 186:121 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events hub video | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events company logo | 300 × 56 |  | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events main event image | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events branding background | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events session image | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events session/speaker/lobby video | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events session resource link image | 800 × 800 | 1:1 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events speaker photo | 160 × 160 | 1:1 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events exhibitor/booth logo | 320 × 238 | 160:119 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events exhibitor/showcase image | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events lobby image | 1920 × 1080 | 16:9 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events expo booth banner | 4000 × 710 | 400:71 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events booth resources background | 3590 × 1334 | 1795:667 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Events booth space | 486 × 247 | 486:247 | Organic | [Image and video specifications for Zoom Events hosts (KB0068572)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068572) |
| Zoom Rooms scheduling display background | 1920 × 1080 | 16:9 | Organic | [Uploading a scheduling display background image (KB0058868)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058868) |

## Stores and apps

### Amazon

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Product listing main image | 2000 × 2000 | 1:1 | Organic | [Product image guide (Seller Central help G1881)](https://sellercentral.amazon.com/help/hub/reference/external/G1881) |
| Product listing additional image (PT01–PT08, angles, lifestyle, infographic) | 2000 × 2000 | 1:1 | Organic | [Product image guide (Seller Central help G1881)](https://sellercentral.amazon.com/help/hub/reference/external/G1881) |
| Product listing video (horizontal) | 1920 × 1080 | 16:9 | Organic | [Shoppable video guide (Seller Central help)](https://sellercentral.amazon.com/help/hub/reference/external/GUZBYWTTVULY6C9Y) |
| Product listing video (vertical) | 1080 × 1920 | 9:16 | Organic | [Shoppable video guide (Seller Central help)](https://sellercentral.amazon.com/help/hub/reference/external/GUZBYWTTVULY6C9Y) |
| A+ Standard image header with text | 970 × 600 | 97:60 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements), [How to create A+ Content: design tips, guidelines, and examples (Amazon Sell blog, 2025-09-24)](https://sell.amazon.com/blog/a-plus-content-design-guide) |
| A+ Standard image & dark/light text overlay | 970 × 300 | 97:30 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard company logo | 600 × 180 | 10:3 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard module image (single left/right image, three images & text and others) | 300 × 300 | 1:1 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard single image & sidebar (main image) | 300 × 400 | 3:4 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard single image & sidebar (sidebar image) | 350 × 175 | 2:1 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard four image & text | 220 × 220 | 1:1 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard four image/text quadrant | 135 × 135 | 1:1 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Standard comparison chart (per product) | 150 × 300 | 1:2 | Organic | Unverified. [Complete guide to Amazon image requirements (GOAT Consulting)](https://www.goatconsulting.com/merchandising/complete-guide-to-amazon-image-requirements) |
| A+ Premium full-width image / background image with text | 1464 × 600 | 61:25 | Organic | Unverified. [Amazon A+ Premium listing guide (AMALYZE)](https://amalyze.com/resources/guides/listing/amazon-listing-aplus-premium) |
| A+ Premium image carousel (per frame) | 1464 × 600 | 61:25 | Organic | Unverified. [Amazon A+ Premium listing guide (AMALYZE)](https://amalyze.com/resources/guides/listing/amazon-listing-aplus-premium) |
| A+ Premium interactive hotspot (base image) | 1464 × 600 | 61:25 | Organic | Unverified. [Amazon A+ Premium listing guide (AMALYZE)](https://amalyze.com/resources/guides/listing/amazon-listing-aplus-premium) |
| A+ Premium video module | 1920 × 1080 | 16:9 | Organic | Unverified. [Amazon A+ Premium listing guide (AMALYZE)](https://amalyze.com/resources/guides/listing/amazon-listing-aplus-premium) |
| A+ Brand Story background (hero) | 3000 × 600 | 5:1 | Organic | Unverified. [Amazon Brand Story: image sizes, modules, and how to set it up (GOAT Consulting)](https://www.goatconsulting.com/merchandising/amazon-brand-story) |
| A+ Brand Story focus image | 362 × 453 | 4:5 | Organic | Unverified. [Amazon Brand Story: image sizes, modules, and how to set it up (GOAT Consulting)](https://www.goatconsulting.com/merchandising/amazon-brand-story) |
| A+ Brand Story logo and description | 300 × 150 | 2:1 | Organic | Unverified. [Amazon Brand Story: image sizes, modules, and how to set it up (GOAT Consulting)](https://www.goatconsulting.com/merchandising/amazon-brand-story) |
| Brand Store hero (header) | 3000 × 600 | 5:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store brand logo | 400 × 400 | 1:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store full-width tile (image, image with text, shoppable) | 3000 × 1500 | 2:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store large tile | 1500 × 1500 | 1:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store medium tile / gallery image | 1500 × 750 | 2:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store small tile | 750 × 750 | 1:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store full-width video tile / background video | 1920 × 960 | 2:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Brand Store large video tile | 1080 × 1080 | 1:1 | Organic | [Stores creative guidelines (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/stores) |
| Amazon Posts image | 1080 × 1080 | 1:1 | Organic | [Posts content guidelines and acceptance policies (Amazon Ads)](https://advertising.amazon.com/resources/ad-policy/posts) |
| Amazon Posts image (portrait) | 1080 × 1350 | 4:5 | Organic | [Posts content guidelines and acceptance policies (Amazon Ads)](https://advertising.amazon.com/resources/ad-policy/posts) |
| Sponsored Brands video | 1920 × 1080 | 16:9 | Ad | [Sponsored Brands video creative (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/sponsored-brands-video) |
| Sponsored Brands custom image (product collection) | 1200 × 628 | 1.91:1 | Ad | Unverified. [Amazon requires custom images for Sponsored Brands campaigns (JumpFly)](https://www.jumpfly.com/blog/amazon-requires-custom-images-for-sponsored-brands-campaigns-with-specs/) |
| Sponsored Brands brand logo | 400 × 400 | 1:1 | Ad | [Asset-based and Brand Store creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/component-based-creative) |
| Sponsored Display / DSP responsive custom image (square) | 1200 × 1200 | 1:1 | Ad | [eCommerce display creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/ecommerce), [Asset-based and Brand Store creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/component-based-creative) |
| Sponsored Display / DSP responsive custom image (horizontal) | 1200 × 628 | 1.91:1 | Ad | [eCommerce display creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/ecommerce), [Asset-based and Brand Store creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/component-based-creative) |
| Sponsored Display / DSP responsive custom image (vertical) | 900 × 1600 | 9:16 | Ad | [eCommerce display creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/ecommerce), [Asset-based and Brand Store creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/component-based-creative) |
| Sponsored Display / DSP responsive logo | 600 × 100 | 6:1 | Ad | [eCommerce display creatives (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/ecommerce) |
| Sponsored Display / display ads video | 1920 × 1080 | 16:9 | Ad | [Get started with display ads with video (Amazon Ads guide)](https://advertising.amazon.com/library/guides/display-ads-video-creative) |
| DSP medium rectangle | 300 × 250 | 6:5 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/), [Mobile app static banner ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/mobile-banners) |
| DSP leaderboard | 728 × 90 | 364:45 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/), [Mobile app static banner ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/mobile-banners) |
| DSP wide skyscraper | 160 × 600 | 4:15 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/) |
| DSP large rectangle (half page) | 300 × 600 | 1:2 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/) |
| DSP billboard 970×250 (2x) | 1940 × 500 | 97:25 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/) |
| DSP mobile leaderboard 320×50 (2x) | 640 × 100 | 32:5 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/), [Mobile app static banner ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/mobile-banners) |
| DSP mobile detail/search banner 414×125 (2x) | 828 × 250 | 414:125 | Ad | [Amazon DSP desktop and mobile web static display ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/desktop/) |
| DSP online video (horizontal) | 1920 × 1080 | 16:9 | Ad | [Online video ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/video/online-video-ads) |
| DSP online video (vertical) | 1080 × 1920 | 9:16 | Ad | [Online video ads (Amazon Ads ad specs)](https://advertising.amazon.com/resources/ad-specs/dsp/video/online-video-ads) |

### Apple App Store

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| App icon (iPhone, iPad, Mac) | 1024 × 1024 | 1:1 | Organic | [App icons, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| App icon (Apple Watch) | 1088 × 1088 | 1:1 | Organic | [App icons, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| App icon (Apple Vision Pro) | 1024 × 1024 | 1:1 | Organic | [App icons, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| App icon, App Store (Apple TV) | 1280 × 768 | 5:3 | Organic | [App icons, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons), [Asset Catalog Format Reference: Brand Assets Type (archived)](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/BrandAssetsType.html) |
| Screenshot, iPhone 6.9" (Dynamic Island large) | 1320 × 2868 | ~9:19.5 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPhone 6.3" (Dynamic Island medium) | 1206 × 2622 | ~9:19.5 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPhone 6.5" (Face ID large) | 1284 × 2778 | ~9:19.5 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPhone Duo outer display | 1398 × 2034 | ~0.69:1 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPhone Duo inner display | 2007 × 2853 | ~0.70:1 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPhone 5.5" (Home Button large) | 1242 × 2208 | 9:16 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPad 13" | 2064 × 2752 | 3:4 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, iPad 11" | 1668 × 2420 | ~0.69:1 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, Mac | 2880 × 1800 | 16:10 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, Apple TV | 3840 × 2160 | 16:9 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, Apple Vision Pro | 3840 × 2160 | 16:9 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| Screenshot, Apple Watch | 422 × 514 | ~0.82:1 | Organic | [Screenshot specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| App preview, iPhone (all Face ID / Dynamic Island / Duo) | 886 × 1920 | ~6:13 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| App preview, iPhone 5.5" / 4" | 1080 × 1920 | 9:16 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| App preview, iPad (13", 11", 10.5") | 1200 × 1600 | 3:4 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| App preview, Mac | 1920 × 1080 | 16:9 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| App preview, Apple TV | 1920 × 1080 | 16:9 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| App preview, Apple Vision Pro | 3840 × 2160 | 16:9 | Organic | [App preview specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| In-app event card | 1920 × 1080 | 16:9 | Organic | [In-App Event media and audio specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/in-app-events/in-app-event-media-and-audio-specifications/), [Creative assets specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/) |
| In-app event details page | 1080 × 1920 | 9:16 | Organic | [In-App Event media and audio specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/in-app-events/in-app-event-media-and-audio-specifications/), [Creative assets specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/) |
| Product page header | 3840 × 1646 | 21:9 | Organic | [Creative assets specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/) |
| Search results creative | 3840 × 2560 | 3:2 | Organic | [Creative assets specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/) |
| Universal header + search asset | 5244 × 2950 | 16:9 | Organic | [Creative assets specifications, App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/), [App Store asset best practices](https://developer.apple.com/app-store/asset-best-practices/) |
| Apple Ads, search results ad | 1320 × 2868 | ~9:19.5 | Ad | [Create Ad Variations, Apple Ads Help](https://searchads.apple.com/help/ad-creative/0077-create-search-results-ad-variations), [Glossary, Apple Ads Help](https://ads.apple.com/app-store/help-glossary) |
| Apple Ads, Today tab ad | 1320 × 2868 | ~9:19.5 | Ad | [Today Tab, Apple Ads Help](https://ads.apple.com/app-store/help/ad-placements/0083-today-tab) |

### eBay

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Listing photo (square) | 1600 × 1600 | 1:1 | Organic | [eBay Help: Adding pictures to your listings](https://www.ebay.com/help/selling/listings/adding-pictures-listings?id=4148) |
| Listing photo (wide) | 1600 × 900 | 16:9 | Organic | [eBay Help: Adding pictures to your listings](https://www.ebay.com/help/selling/listings/adding-pictures-listings?id=4148) |
| Listing video | 1920 × 1080 | 16:9 | Organic | [eBay Help: Adding a video to your listing](https://www.ebay.com/help/selling/listings/creating-managing-listings/add-video-to-listing?id=5272) |
| Store logo | 300 × 300 | 1:1 | Organic | [eBay Help: Managing your eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090), [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Store billboard | 1280 × 290 | 128:29 | Organic | [eBay Help: Managing your eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090), [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Store billboard / About video | 1920 × 1080 | 16:9 | Organic | [eBay Help: Managing your eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090), [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Store marketing banner | 640 × 640 | 1:1 | Organic | [eBay Help: Managing your eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090), [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Store banner collection image | 640 × 360 | 16:9 | Organic | [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Store featured category | 300 × 300 | 1:1 | Organic | [eBay Help: Managing your eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090), [eBay: Design a professional eBay Store (image guide)](https://pages.ebay.com/image-guide) |
| Member profile photo | 500 × 500 | 1:1 | Organic | Unverified. [Aiarty: eBay profile picture size (third-party)](https://aiarty.com/ai-product-image-editing/ebay-profile-picture-size.htm) |

### Etsy

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Listing photo (square) | 2000 × 2000 | 1:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [How to Edit Your Listing Photos (Etsy Help)](https://help.etsy.com/hc/en-us/articles/360016260113-How-to-Edit-Your-Listing-Photos), [How to Create a Listing (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015628707-How-to-Create-a-Listing) |
| Listing photo (landscape) | 2667 × 2000 | 4:3 | Organic | Unverified. [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [Etsy Photo Aspect Ratio for Listings (Insight Agent, third-party)](https://www.insightagent.app/guides/etsy-photo-aspect-ratio-guide) |
| Listing video (square) | 1080 × 1080 | 1:1 | Organic | [How to Add Listing Videos (Etsy Help)](https://help.etsy.com/hc/en-us/articles/360053206073-How-to-Add-Listing-Videos), [How to Create a Listing (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015628707-How-to-Create-a-Listing) |
| Listing video (landscape) | 1920 × 1080 | 16:9 | Organic | [How to Add Listing Videos (Etsy Help)](https://help.etsy.com/hc/en-us/articles/360053206073-How-to-Add-Listing-Videos) |
| Listing video (vertical) | 1080 × 1920 | 9:16 | Organic | [How to Add Listing Videos (Etsy Help)](https://help.etsy.com/hc/en-us/articles/360053206073-How-to-Add-Listing-Videos) |
| Big shop banner | 3360 × 840 | 4:1 | Organic | [Customizing the Look of Your Shop Home (Etsy Seller Handbook)](https://www.etsy.com/seller-handbook/article/customizing-the-look-of-your-shop-home/358680450619), [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop) |
| Mini shop banner | 1600 × 213 | ~7.5:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [Customizing the Look of Your Shop Home (Etsy Seller Handbook)](https://www.etsy.com/seller-handbook/article/customizing-the-look-of-your-shop-home/358680450619) |
| Carousel banner (Etsy Plus) | 1200 × 300 | 4:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [Customizing the Look of Your Shop Home (Etsy Seller Handbook)](https://www.etsy.com/seller-handbook/article/customizing-the-look-of-your-shop-home/358680450619) |
| Shop icon / logo | 500 × 500 | 1:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [Customizing the Look of Your Shop Home (Etsy Seller Handbook)](https://www.etsy.com/seller-handbook/article/customizing-the-look-of-your-shop-home/358680450619) |
| Shop owner / profile photo | 400 × 400 | 1:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop), [Customizing the Look of Your Shop Home (Etsy Seller Handbook)](https://www.etsy.com/seller-handbook/article/customizing-the-look-of-your-shop-home/358680450619) |
| Order receipt banner | 760 × 100 | 7.6:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop) |
| About section featured photo | 760 × 468 | ~1.62:1 | Organic | [How to Edit Your Shop's About Section (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015628487-How-to-Edit-Your-Shop-s-About-Section) |
| About section featured video | 1920 × 1080 | 16:9 | Organic | [How to Edit Your Shop's About Section (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015628487-How-to-Edit-Your-Shop-s-About-Section) |
| Etsy Team logo | 170 × 100 | 1.7:1 | Organic | [Requirements and Best Practices for Images in Your Etsy Shop (Etsy Help)](https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop) |

### Google Play

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| App icon | 512 × 512 | 1:1 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [Google Play icon design specifications (Android Developers)](https://developer.android.com/distribute/google-play/resources/icon-design-specifications) |
| Feature graphic | 1024 × 500 | ~2.05:1 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Phone screenshot, portrait | 1080 × 1920 | 9:16 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Phone screenshot, landscape | 1920 × 1080 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| 7-inch tablet screenshot, portrait | 1080 × 1920 | 9:16 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| 7-inch tablet screenshot, landscape | 1920 × 1080 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| 10-inch tablet screenshot, portrait | 1440 × 2560 | 9:16 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| 10-inch tablet screenshot, landscape | 2560 × 1440 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Chromebook screenshot, landscape | 1920 × 1080 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Chromebook screenshot, portrait | 1080 × 1920 | 9:16 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Wear OS screenshot (app or watch face) | 512 × 512 | 1:1 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Android TV screenshot | 1920 × 1080 | 16:9 | Organic | Unverified. [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [Android app screenshot sizes and guidelines for Google Play (AppRadar, third-party)](https://appradar.com/blog/android-app-screenshot-sizes-and-guidelines-for-google-play) |
| Android TV banner | 1280 × 720 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Android XR screenshot | 3840 × 2400 | 8:5 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Android Automotive OS screenshot, portrait | 800 × 1280 | 5:8 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Android Automotive OS screenshot, landscape | 1024 × 768 | 4:3 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Preview video, landscape | 1920 × 1080 | 16:9 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Preview video, portrait | 1080 × 1920 | 9:16 | Organic | [Add preview assets to showcase your app (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) |
| Promotional content (LiveOps) primary image | 1920 × 1080 | 16:9 | Organic | [Reach more customers by adhering to our content quality guidelines (Play Console Help, promotional content)](https://support.google.com/googleplay/android-developer/answer/12929944?hl=en) |
| Promotional content animated asset | 1920 × 1080 | 16:9 | Organic | [Reach more customers by adhering to our content quality guidelines (Play Console Help, promotional content)](https://support.google.com/googleplay/android-developer/answer/12929944?hl=en) |
| Promotional content video | 1920 × 1080 | 16:9 | Organic | [Reach more customers by adhering to our content quality guidelines (Play Console Help, promotional content)](https://support.google.com/googleplay/android-developer/answer/12929944?hl=en) |
| App campaign image, landscape | 1200 × 628 | 1.91:1 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en), [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |
| App campaign image, square | 1200 × 1200 | 1:1 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en), [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |
| App campaign image, portrait | 1200 × 1500 | 4:5 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en), [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |
| App campaign video, landscape | 1920 × 1080 | 16:9 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en) |
| App campaign video, portrait | 1080 × 1920 | 9:16 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en) |
| App campaign video, square | 1080 × 1080 | 1:1 | Ad | [App campaigns specs and format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091671?hl=en) |

### Gumroad

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Product cover | 1280 × 720 | 16:9 | Organic | [Gumroad Help Center, "Adding cover and thumbnail images"](https://gumroad.com/help/article/60-adding-a-cover-image) |
| Product thumbnail | 600 × 600 | 1:1 | Organic | [Gumroad Help Center, "Adding cover and thumbnail images"](https://gumroad.com/help/article/60-adding-a-cover-image), [Gumroad source, Thumbnail model validation](https://github.com/antiwork/gumroad/blob/main/app/models/thumbnail.rb), [Gumroad source, product thumbnail editor ("square and at least 600x600px")](https://github.com/antiwork/gumroad/blob/main/app/javascript/components/ProductEdit/ProductTab/ThumbnailEditor.tsx) |
| Profile picture / logo | 400 × 400 | 1:1 | Organic | [Gumroad source, user avatar validation (200 px minimum, 10 MB, png/jpg)](https://github.com/antiwork/gumroad/blob/main/app/modules/user/validations.rb) |

### itch.io

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Project cover image (browse, search, profile, embeds) | 630 × 500 |  | Organic | Unverified. [itch.io community post quoting the cover upload form (Minimum 315x250, Recommended 630x500)](https://itch.io/post/10822954), [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates) |
| Project cover, 2× / 4× | 1260 × 1000 | 63:50 | Organic | Unverified. [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates) |
| Screenshots (sidebar / gallery) | 1920 × 1080 | 16:9 | Organic | Unverified. [itch.io forum: What size for the game's site banner and background (admin reply, 960 px column)](https://itch.io/t/358996/what-size-for-the-games-site-banner-and-background), [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates), [How to Launch Your Game on itch.io (2026 Guide)](https://app.cinevva.com/guides/itch-io-launch-guide) |
| Page banner / header (Edit Theme) | 960 × 300 | 16:5 | Organic | Unverified. [itch.io Creators docs: Designing your page](https://itch.io/docs/creators/design), [itch.io forum: What size for the game's site banner and background (admin reply, 960 px column)](https://itch.io/t/358996/what-size-for-the-games-site-banner-and-background), [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates) |
| Page background (Edit Theme) | 1920 × 1080 | 16:9 | Organic | Unverified. [itch.io Creators docs: Designing your page](https://itch.io/docs/creators/design), [itch.io forum: What size for the game's site banner and background (admin reply, 960 px column)](https://itch.io/t/358996/what-size-for-the-games-site-banner-and-background) |
| Description / devlog inline image (no sidebar) | 920 × 518 | 16:9 | Organic | Unverified. [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates) |
| Description inline image (with screenshot sidebar) | 560 × 315 | 16:9 | Organic | Unverified. [Itch Game Page Image Guide and Templates (hedgiespresso)](https://hedgiespresso.itch.io/itch-page-image-templates) |
| Devlog post thumbnail | 630 × 500 | 63:50 | Organic | Unverified. [itch.io community post on thumbnail size (630x500)](https://itch.io/post/2289750) |
| Profile picture | 500 × 500 | 1:1 | Organic | Unverified. [itch.io forum: What are the dimensions for a profile picture](https://itch.io/t/1132672/what-are-the-dimensions-for-a-profile-picture) |

### Shopify

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Product image (square) | 2048 × 2048 | 1:1 | Organic | [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Product image (portrait, theme option) | 2048 × 2560 | 4:5 | Organic | Unverified. [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Product video | 1920 × 1080 | 16:9 | Organic | [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Product video (square, matches gallery) | 2048 × 2048 | 1:1 | Organic | Unverified. [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Collection image | 2048 × 2048 | 1:1 | Organic | [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Slideshow / image banner (desktop) | 3840 × 1600 | 12:5 | Organic | Unverified. [Shopify Help Center, Theme images (image requirements and best practices)](https://help.shopify.com/en/manual/online-store/images/theme-images), [Fudge, Shopify Image Sizes: Product Photos, Banners, and Mobile Cropping Explained](https://www.fudge.ai/guides/shopify-image-sizes/) |
| Slideshow / image banner (16:9) | 1920 × 1080 | 16:9 | Organic | Unverified. [Shopify Help Center, Theme images (image requirements and best practices)](https://help.shopify.com/en/manual/online-store/images/theme-images), [Fudge, Shopify Image Sizes: Product Photos, Banners, and Mobile Cropping Explained](https://www.fudge.ai/guides/shopify-image-sizes/) |
| Image banner (mobile image) | 1600 × 2000 | 4:5 | Organic | Unverified. [Fudge, Shopify Image Sizes: Product Photos, Banners, and Mobile Cropping Explained](https://www.fudge.ai/guides/shopify-image-sizes/) |
| Store logo (theme header) | 600 × 200 | 3:1 | Organic | [Shopify Help Center, Theme settings (logo and favicon)](https://help.shopify.com/en/manual/online-store/themes/theme-structure/theme-settings), [Shopify Help Center, Theme images (image requirements and best practices)](https://help.shopify.com/en/manual/online-store/images/theme-images) |
| Brand assets: default logo | 1024 × 256 | 4:1 | Organic | [Shopify Help Center, Managing brand assets](https://help.shopify.com/en/manual/promoting-marketing/managing-brand-assets) |
| Brand assets: square logo | 512 × 512 | 1:1 | Organic | [Shopify Help Center, Managing brand assets](https://help.shopify.com/en/manual/promoting-marketing/managing-brand-assets) |
| Brand assets: cover image (Shop app) | 1920 × 1080 | 16:9 | Organic | [Shopify Help Center, Managing brand assets](https://help.shopify.com/en/manual/promoting-marketing/managing-brand-assets) |
| Favicon | 32 × 32 | 1:1 | Organic | [Shopify Help Center, Theme settings (logo and favicon)](https://help.shopify.com/en/manual/online-store/themes/theme-structure/theme-settings) |
| Blog post featured image | 1800 × 1000 | 9:5 | Organic | Unverified. [Dash, The best Shopify image sizes for your online store](https://www.dash.app/blog/shopify-image-sizes) |
| Social sharing image (og:image) | 1200 × 628 | 1.91:1 | Organic | Unverified. [Shopify Help Center, Choosing a social media image](https://help.shopify.com/en/manual/online-store/images/showing-social-media-thumbnail-images), [Shopify Community, Social sharing image is blur on mobile](https://community.shopify.com/t/social-sharing-image-is-blur-on-mobile/319475) |
| Video cover / thumbnail | 1920 × 1080 | 16:9 | Organic | Unverified. [Shopify Help Center, Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) |

### Steam

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Store header capsule | 920 × 430 | 2.14:1 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store small capsule | 462 × 174 | 2.66:1 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store main capsule | 1232 × 706 | 1.75:1 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store vertical capsule | 748 × 896 | 5:6 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store screenshot | 1920 × 1080 | 16:9 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store page background | 1438 × 810 |  | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Bundle header | 707 × 232 | 3.05:1 | Organic | [Steamworks Documentation – Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Store trailer | 1920 × 1080 | 16:9 | Organic | [Steamworks Documentation – Trailers](https://partner.steamgames.com/doc/store/trailer) |
| Library capsule | 600 × 900 | 2:3 | Organic | [Steamworks Documentation – Library Assets](https://partner.steamgames.com/doc/store/assets/libraryassets) |
| Library header capsule | 920 × 430 | 2.14:1 | Organic | [Steamworks Documentation – Library Assets](https://partner.steamgames.com/doc/store/assets/libraryassets) |
| Library hero | 3840 × 1240 | 3.1:1 | Organic | [Steamworks Documentation – Library Assets](https://partner.steamgames.com/doc/store/assets/libraryassets) |
| Library logo | 1280 × 720 |  | Organic | [Steamworks Documentation – Library Assets](https://partner.steamgames.com/doc/store/assets/libraryassets) |
| Shortcut icon | 256 × 256 | 1:1 | Organic | [Steamworks Documentation – Graphical Assets Overview](https://partner.steamgames.com/doc/store/assets) |
| Community/app icon | 184 × 184 | 1:1 | Organic | [Steamworks Documentation – Graphical Assets Overview](https://partner.steamgames.com/doc/store/assets) |
| Event/announcement cover | 800 × 450 | 16:9 | Organic | [Steamworks Documentation – Event Graphical Assets](https://partner.steamgames.com/doc/store/assets/eventassets) |
| Event/announcement header | 1920 × 622 | 3.09:1 | Organic | [Steamworks Documentation – Event Graphical Assets](https://partner.steamgames.com/doc/store/assets/eventassets) |
| Community profile background | 1920 × 1080 | 16:9 | Organic | [Steamworks Documentation – Steam Community Items](https://partner.steamgames.com/doc/marketing/tradingcards) |
| Animated profile background | 1920 × 1080 | 16:9 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Animated mini-profile background | 640 × 570 | 64:57 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Community avatar | 184 × 184 | 1:1 | Organic | Unverified. [Steam Community forum – Avatar pixel size (U)](https://steamcommunity.com/discussions/forum/30/2860219962085846124) |
| Animated avatar | 184 × 184 | 1:1 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Animated avatar frame | 224 × 224 | 1:1 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Animated sticker | 150 × 150 | 1:1 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Game profile logo | 512 × 512 | 1:1 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Steam Deck / Big Picture startup movie | 1920 × 1200 | 16:10 | Organic | [Steamworks Documentation – Points Shop Items](https://partner.steamgames.com/doc/marketing/pointsshopitems) |
| Trading card (large) | 1920 × 1080 | 16:9 | Organic | [Steamworks Documentation – Steam Community Items](https://partner.steamgames.com/doc/marketing/tradingcards) |
| Trading card (small) | 206 × 184 | 1.12:1 | Organic | [Steamworks Documentation – Steam Community Items](https://partner.steamgames.com/doc/marketing/tradingcards) |
| Community badge | 80 × 80 | 1:1 | Organic | [Steamworks Documentation – Steam Community Items](https://partner.steamgames.com/doc/marketing/tradingcards) |
| Emoticon (large) | 54 × 54 | 1:1 | Organic | [Steamworks Documentation – Steam Community Items](https://partner.steamgames.com/doc/marketing/tradingcards) |

## Advertising

### Display banners (IAB standard)

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Medium rectangle | 300 × 250 | 6:5 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Large rectangle | 336 × 280 | 6:5 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Leaderboard | 728 × 90 |  | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Super leaderboard / pushdown (large leaderboard) | 970 × 90 |  | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Billboard | 970 × 250 |  | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Half page | 300 × 600 | 1:2 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Portrait | 300 × 1050 | 2:7 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096) |
| Wide skyscraper | 160 × 600 | 4:15 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Skyscraper | 120 × 600 | 1:5 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Banner | 468 × 60 | 7.8:1 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Mobile leaderboard (smartphone banner) | 320 × 50 | 6.4:1 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Mobile banner | 300 × 50 | 6:1 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Large mobile banner | 320 × 100 | 16:5 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Mobile banner 300×100 | 300 × 100 | 3:1 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Square | 250 × 250 | 1:1 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Small square | 200 × 200 | 1:1 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Button / micro bar | 120 × 60 | 2:1 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Vertical rectangle | 240 × 400 | 3:5 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Triple widescreen | 250 × 360 | 25:36 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Netboard | 580 × 400 | 29:20 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Top banner | 930 × 180 | 31:6 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Panorama | 980 × 120 | 49:6 | Ad | [Google Ads Help, Uploaded display ads specifications](https://support.google.com/google-ads/answer/1722096), [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Large leaderboard (EU) | 980 × 90 | 98:9 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453) |
| Mobile interstitial, phone portrait | 320 × 480 | 2:3 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453), [Google Ad Manager Help, How mobile app interstitials work](https://support.google.com/admanager/answer/10320506) |
| Mobile interstitial, phone landscape | 480 × 320 | 3:2 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453), [Google Ad Manager Help, How mobile app interstitials work](https://support.google.com/admanager/answer/10320506) |
| Tablet interstitial, portrait | 768 × 1024 | 3:4 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453), [Google Ad Manager Help, How mobile app interstitials work](https://support.google.com/admanager/answer/10320506) |
| Tablet interstitial, landscape | 1024 × 768 | 4:3 | Ad | [Google Ad Manager Help, Supported ad sizes](https://support.google.com/admanager/answer/1100453), [Google Ad Manager Help, How mobile app interstitials work](https://support.google.com/admanager/answer/10320506) |
| Mobile phone interstitial (IAB) | 1080 × 1920 | 9:16 | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf) |
| Mobile phone interstitial (IAB) | 750 × 1334 |  | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf) |
| Mobile phone interstitial (IAB) | 640 × 1136 |  | Ad | [IAB Tech Lab, New Ad Portfolio: Fixed Size Ad Specifications (2017)](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf) |

### Google Ads

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Responsive display ad, landscape image | 1200 × 628 | 1.91:1 | Ad | [About responsive display ads asset specs (Google Ads Help)](https://support.google.com/google-ads/answer/9823397), [Responsive display ad format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17090561) |
| Responsive display ad, square image | 1200 × 1200 | 1:1 | Ad | [About responsive display ads asset specs (Google Ads Help)](https://support.google.com/google-ads/answer/9823397), [Responsive display ad format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17090561) |
| Responsive display ad, vertical image | 900 × 1600 | 9:16 | Ad | [About responsive display ads asset specs (Google Ads Help)](https://support.google.com/google-ads/answer/9823397) |
| Responsive display ad, square logo | 1200 × 1200 | 1:1 | Ad | [Responsive display ad format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17090561) |
| Responsive display ad, wide logo | 1200 × 300 | 4:1 | Ad | [Responsive display ad format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17090561) |
| Uploaded image ad, small square | 200 × 200 | 1:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, vertical rectangle | 240 × 400 | 3:5 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, square | 250 × 250 | 1:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, triple widescreen | 250 × 360 | 25:36 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, inline rectangle | 300 × 250 | 6:5 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096), [Google Ads specs: ad formats, sizes, and best practices (Google Ads Help)](https://support.google.com/google-ads/answer/13676244) |
| Uploaded image ad, large rectangle | 336 × 280 | 6:5 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, netboard | 580 × 400 | 29:20 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, skyscraper | 120 × 600 | 1:5 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, wide skyscraper | 160 × 600 | 4:15 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, half page | 300 × 600 | 1:2 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, portrait | 300 × 1050 | 2:7 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, banner | 468 × 60 | 7.8:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, leaderboard | 728 × 90 | 8.09:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, top banner | 930 × 180 | 31:6 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, large leaderboard | 970 × 90 | 10.78:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, billboard | 970 × 250 | 97:25 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, panorama | 980 × 120 | 49:6 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, mobile banner | 300 × 50 | 6:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, mobile banner | 320 × 50 | 6.4:1 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, large mobile banner | 320 × 100 | 16:5 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, PL billboard | 750 × 100 | 15:2 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, PL double billboard | 750 × 200 | 15:4 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Uploaded image ad, PL triple billboard | 750 × 300 | 5:2 | Ad | [Uploaded display ads specifications (Google Ads Help)](https://support.google.com/google-ads/answer/1722096) |
| Demand Gen image ad, landscape (YouTube, Discover, Gmail) | 1200 × 628 | 1.91:1 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image ad, square | 1200 × 1200 | 1:1 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image ad, vertical 4:5 | 960 × 1200 | 4:5 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen image ad, vertical 9:16 (YouTube Shorts) | 1080 × 1920 | 9:16 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen square logo | 1200 × 1200 | 1:1 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen carousel card, landscape | 1200 × 628 | 1.91:1 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen carousel card, square | 1200 × 1200 | 1:1 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Demand Gen carousel card, vertical 4:5 | 960 × 1200 | 4:5 | Ad | [About image assets specifications and ad format guidelines for Demand Gen campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/17140672) |
| Performance Max image, landscape | 1200 × 628 | 1.91:1 | Ad | [Performance Max format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091269) |
| Performance Max image, square | 1200 × 1200 | 1:1 | Ad | [Performance Max format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091269) |
| Performance Max image, vertical 4:5 | 960 × 1200 | 4:5 | Ad | [Performance Max format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091269) |
| Performance Max logo, square | 1200 × 1200 | 1:1 | Ad | [Performance Max format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091269) |
| Performance Max logo, landscape | 1200 × 300 | 4:1 | Ad | [Performance Max format requirements (Google Ads Help)](https://support.google.com/google-ads/answer/17091269) |
| App campaign image, square | 1200 × 1200 | 1:1 | Ad | [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |
| App campaign image, landscape | 1200 × 628 | 1.91:1 | Ad | [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |
| App campaign image, portrait | 1200 × 1500 | 4:5 | Ad | [Asset requirements for App campaigns (Google Ads Help)](https://support.google.com/google-ads/answer/9234183) |

### Meta ads (Facebook, Instagram)

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Feed ad | 1440 × 1800 | 4:5 | Ad | [Meta Ads Guide: Facebook Feed image](https://www.facebook.com/business/ads-guide/update/image/facebook-feed), [Meta Ads Guide, Facebook Feed image specs](https://www.facebook.com/business/ads-guide/update/image) |
| Feed, Marketplace, Search, Right column | 1440 × 1440 | 1:1 | Ad | [Meta Ads Guide, Facebook Feed image specs](https://www.facebook.com/business/ads-guide/update/image) |
| Stories / Reels ad | 1440 × 2560 | 9:16 | Ad | [Meta Ads Guide: Facebook Stories image](https://www.facebook.com/business/ads-guide/update/image/facebook-story), [Meta Ads Guide, Instagram Stories image and video specs](https://www.facebook.com/business/ads-guide/update/image/instagram-story) |
| Reels overlay | 1080 × 1080 | 1:1 | Ad | Unverified. No source recorded. |
| In-stream video | 1920 × 1080 | 16:9 | Ad | [Meta Ads Guide: video specs](https://www.facebook.com/business/ads-guide/update/video) |
| Carousel card | 1080 × 1080 | 1:1 | Ad | [Meta Ads Guide, Facebook Feed carousel specs](https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed) |

### Microsoft Advertising

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Native ad (Audience campaign), main image | 1200 × 628 | 1.91:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Native ad, square crop | 1200 × 1200 | 1:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad, wide crop | 1206 × 600 | 2.01:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad, wide crop | 1200 × 600 | 2:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad, carousel/headline crop | 1200 × 710 | 1.69:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13), [Microsoft Audience Network creative specifications PDF (last updated 2022-04-18)](https://dev-about.ads.microsoft.com/content/dam/sites/msa-about/global/common/content-lib/pdf/msan-spec.pdf) |
| Native ad, medium crop | 1200 × 784 | 1.53:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad, small crop | 1200 × 968 | 1.24:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad, small crop | 1200 × 1000 | 1.2:1 | Ad | [Best practices for Audience ad images (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56912/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad logo | 1200 × 1200 | 1:1 | Ad | [How do I create Native ads? (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60344/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Native ad logo | 1200 × 300 | 4:1 | Ad | [How do I create Native ads? (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60344/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Multimedia ad (Search, sidebar) | 1200 × 628 | 1.91:1 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0), [ResponsiveAd Data Object (Microsoft Advertising API, updated 2026-09-07)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivead?view=bingads-13) |
| Multimedia ad (Search) | 1200 × 1200 | 1:1 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Multimedia ad (Search) | 1200 × 300 | 4:1 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Multimedia ad (Search) | 600 × 1200 | 1:2 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Multimedia ad logo | 1200 × 1200 | 1:1 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Multimedia ad logo | 1200 × 300 | 4:1 | Ad | [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Performance Max asset group | 1200 × 628 | 1.91:1 | Ad | [AssetGroup Data Object (Microsoft Advertising API, updated 2026-09-23)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/assetgroup?view=bingads-13), [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Performance Max asset group | 1200 × 1200 | 1:1 | Ad | [AssetGroup Data Object (Microsoft Advertising API, updated 2026-09-23)](https://learn.microsoft.com/en-us/advertising/campaign-management-service/assetgroup?view=bingads-13), [Multimedia ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60107/0) |
| Image extension (Search ads) | 1200 × 628 | 1.91:1 | Ad | [Add images to your ad with image extensions (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56706/0) |
| Image extension, 0.93:1 crop | 1116 × 1200 | 0.93:1 | Ad | [Add images to your ad with image extensions (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56706/0), [Microsoft Audience Network creative specifications PDF (last updated 2022-04-18)](https://dev-about.ads.microsoft.com/content/dam/sites/msa-about/global/common/content-lib/pdf/msan-spec.pdf) |
| Image extension, mobile single image | 1200 × 1200 | 1:1 | Ad | [Add images to your ad with image extensions (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/56706/0) |
| Display ad: Medium rectangle | 300 × 250 | 6:5 | Ad | [About Display ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60196/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Display ad: Leaderboard | 728 × 90 | 728:90 | Ad | [About Display ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60196/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Display ad: Billboard | 970 × 250 | 97:25 | Ad | [About Display ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60196/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Display ad: Half page | 300 × 600 | 1:2 | Ad | [About Display ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60196/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Display ad: Wide skyscraper | 160 × 600 | 4:15 | Ad | [About Display ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60196/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Display ad: Mobile banner | 320 × 50 | 32:5 | Ad | [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Online Video / CTV ad, Native ad video | 1920 × 1080 | 16:9 | Ad | [About Online Video ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60102/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Online Video ad, vertical | 1080 × 1920 | 9:16 | Ad | [About Online Video ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60102/0), [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Online Video ad, 4:3 | 1440 × 1080 | 4:3 | Ad | [About Online Video ads (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60102/0) |
| Xbox Home banner (direct buy, Microsoft's own sites) | 400 × 225 | 16:9 | Ad | [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |
| Xbox Store banner (direct buy, Microsoft's own sites) | 468 × 263 | 16:9 | Ad | [Creative Specs: Display, Native and Video (Microsoft Advertising Help)](https://help.ads.microsoft.com/#apex/ads/en/60207/0) |

## Web and email

### Email

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Newsletter body, 600 px template | 600 × 2000 | 3:10 | Organic | [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/), [Klaviyo, Optimal email template width reference](https://help.klaviyo.com/hc/en-us/articles/115001435352) |
| Newsletter body, 640 px template | 640 × 2000 | 8:25 | Organic | Unverified. [(U) Moda, Email image sizes](https://moda.app/resources/sizes/email-sizes) |
| Newsletter body, 660 px template | 660 × 2000 | 33:100 | Organic | [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/) |
| Email header / masthead banner | 1200 × 400 | 3:1 | Organic | Unverified. [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/), [(U) Moda, Email image sizes](https://moda.app/resources/sizes/email-sizes) |
| Hero banner | 1200 × 600 | 2:1 | Organic | Unverified. [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/), [Klaviyo, Images in emails reference](https://help.klaviyo.com/hc/en-us/articles/115005253688) |
| Full-width body image | 1200 × 800 | 3:2 | Organic | [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/), [Klaviyo, Images in emails reference](https://help.klaviyo.com/hc/en-us/articles/115005253688) |
| Two-column image (each) | 600 × 600 | 1:1 | Organic | [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/) |
| Three-column image (each) | 400 × 400 | 1:1 | Organic | [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/) |
| Email header logo | 600 × 200 | 3:1 | Organic | Unverified. [Mailchimp, Image Recommendations for Content Blocks](https://mailchimp.com/help/image-requirements-for-templates/), [(U) Moda, Email image sizes](https://moda.app/resources/sizes/email-sizes) |
| Email signature banner | 600 × 100 | 6:1 | Organic | Unverified. [Gmail Help, Troubleshoot issues with Gmail signatures](https://support.google.com/mail/answer/11468381), [(U) WiseStamp, What is the correct email signature image size](https://www.wisestamp.com/guides/what-is-the-correct-email-signature-image-size/) |
| Email signature logo | 400 × 100 | 4:1 | Organic | [Gmail Help, Troubleshoot issues with Gmail signatures](https://support.google.com/mail/answer/11468381) |
| Email signature logo or photo (square) | 100 × 100 | 1:1 | Organic | Unverified. [Gmail Help, Troubleshoot issues with Gmail signatures](https://support.google.com/mail/answer/11468381), [(U) WiseStamp, What is the correct email signature image size](https://www.wisestamp.com/guides/what-is-the-correct-email-signature-image-size/) |
| Gmail Promotions annotation, single image | 1200 × 628 | 1.91:1 | Organic | [Google for Developers, Gmail Promotions tab annotations overview](https://developers.google.com/workspace/gmail/promotab/overview), [Google for Developers, Promotions tab best practices](https://developers.google.com/gmail/promotab/best-practices) |
| Gmail Promotions product carousel (1:1) | 1080 × 1080 | 1:1 | Organic | [Google for Developers, Gmail Promotions tab annotations overview](https://developers.google.com/workspace/gmail/promotab/overview), [Google for Developers, Promotions tab best practices](https://developers.google.com/gmail/promotab/best-practices) |
| Gmail Promotions product carousel (4:5) | 1080 × 1350 | 4:5 | Organic | [Google for Developers, Gmail Promotions tab annotations overview](https://developers.google.com/workspace/gmail/promotab/overview), [Google for Developers, Promotions tab best practices](https://developers.google.com/gmail/promotab/best-practices) |
| Gmail Promotions annotation sender logo | 512 × 512 | 1:1 | Organic | Unverified. [Google for Developers, Gmail Promotions tab annotations overview](https://developers.google.com/workspace/gmail/promotab/overview), [(U) Stripo Help, What are the Google promotional annotations and how to use them](https://support.stripo.email/en/articles/6449035-what-are-the-google-promotional-annotations-and-how-to-use-them) |
| BIMI logo (Gmail, Yahoo, Apple Mail) | 512 × 512 | 1:1 | Organic | [Google Workspace Admin Help, Set up BIMI](https://knowledge.workspace.google.com/admin/security/set-up-bimi) |
| Apple Branded Mail logo (Apple Business) | 1024 × 1024 | 1:1 | Organic | [Apple Support, Apple Business Image Style Guide / Brand identity attributes](https://support.apple.com/guide/business/apple-business-image-style-guide-axm1009cd52f/web) |

### Website

| Size | W × H | Ratio | Type | Source |
|---|---|---|---|---|
| Open Graph / link preview (og:image) | 1200 × 630 | 1.91:1 | Organic | [The Open Graph protocol](https://ogp.me/), [Meta for Developers – Images in Link Shares](https://developers.facebook.com/docs/sharing/webmasters/images/) |
| Link preview, square fallback | 1200 × 1200 | 1:1 | Organic | [Meta for Developers – Images in Link Shares](https://developers.facebook.com/docs/sharing/webmasters/images/) |
| Favicon (favicon.ico) | 48 × 48 | 1:1 | Organic | [Google Search Central – Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search), [MDN – Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) |
| Favicon PNG 32 | 32 × 32 | 1:1 | Organic | [MDN – Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) |
| Apple touch icon | 180 × 180 | 1:1 | Organic | [Apple – Configuring Web Applications (Safari Web Content Guide)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) |
| PWA icon 192 | 192 × 192 | 1:1 | Organic | [web.dev – Add a web app manifest](https://web.dev/articles/add-manifest), [MDN – Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) |
| PWA icon 512 | 512 × 512 | 1:1 | Organic | [web.dev – Add a web app manifest](https://web.dev/articles/add-manifest), [MDN – Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) |
| PWA maskable icon | 512 × 512 | 1:1 | Organic | [web.dev – Adaptive icon support in PWAs with maskable icons](https://web.dev/articles/maskable-icon), [MDN – Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) |
| PWA install screenshot (desktop) | 1280 × 720 | 16:9 | Organic | [web.dev – Add a web app manifest](https://web.dev/articles/add-manifest) |
| PWA install screenshot (mobile) | 1080 × 1920 | 9:16 | Organic | [web.dev – Add a web app manifest](https://web.dev/articles/add-manifest) |
| Hero banner (desktop) | 1920 × 1080 | 16:9 | Organic | Unverified. common practice, no official page |
| Hero banner, short (desktop) | 1920 × 600 | 16:5 | Organic | Unverified. common practice, no official page |
| Hero banner (mobile) | 1080 × 1350 | 4:5 | Organic | Unverified. common practice, no official page |
| Blog featured image | 1200 × 675 | 16:9 | Organic | [Google Search Central – Get on Discover](https://developers.google.com/search/docs/appearance/google-discover), [Google Search Central – Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article) |
| Blog featured image 4:3 | 1200 × 900 | 4:3 | Organic | [Google Search Central – Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article) |
| Blog featured image 1:1 | 1200 × 1200 | 1:1 | Organic | [Google Search Central – Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article) |

## Print, screens and everything else

Print sizes keep their own unit. Bleed is the extra margin printers ask for around the trim size.

### Presentations

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| 16:9 Full HD slide | 1920 × 1080 px |  | International | [Canva Design Wiki, "Presentation Sizes"](https://www.canva.com/sizes/presentation/), [The PowerPoint Blog, "Presentation App Default Page Size" (2026-01-13)](https://thepowerpointblog.com/2026/01/13/), [European Society of Cardiology, "Speaker Guidelines" (Cardio-Oncology congress)](https://www.escardio.org/events/congresses/esc-cardio-oncology/scientific-sessions/faculty-and-presenters/speaker-guidelines/) |
| 16:9 HD slide | 1280 × 720 px |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides), [The PowerPoint Blog, "Presentation App Default Page Size" (2026-01-13)](https://thepowerpointblog.com/2026/01/13/) |
| 16:9 4K slide | 3840 × 2160 px |  | International | Unverified. [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |
| Google Slides default (16:9) | 960 × 540 px |  | International | Unverified. [Plus AI, "Google Slides size and dimensions"](https://plusai.com/blog/google-slides-size-and-dimensions), [The PowerPoint Blog, "Presentation App Default Page Size" (2026-01-13)](https://thepowerpointblog.com/2026/01/13/) |
| PowerPoint Widescreen | 13.333 × 7.5 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| On-screen Show 16:9 | 10 × 5.625 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| 4:3 slide | 1024 × 768 px |  | International | [Canva Design Wiki, "Presentation Sizes"](https://www.canva.com/sizes/presentation/) |
| PowerPoint Standard 4:3 | 10 × 7.5 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| 16:10 slide | 1920 × 1200 px |  | International | Unverified. [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| On-screen Show 16:10 | 10 × 6.25 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| A4 Paper slide (PowerPoint) | 10.833 × 7.5 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| A4 landscape deck | 297 × 210 mm | 3 mm | International, Europe, Asia, LatAm, AU | Unverified. [Markus Kuhn, "International standard paper sizes" (ISO 216)](https://www.nhn.ou.edu/~huanggs/iso-paper), [University of Melbourne print room, "Understanding Paper Size"](https://ms-kb.msd.unimelb.edu.au/print-room/file-preperation/understanding-paper-size) |
| US Letter landscape deck | 11 × 8.5 in | 0.125 in | North America | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| A3 Paper slide (PowerPoint) | 14 × 10.5 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| Ledger Paper slide (PowerPoint) | 13.319 × 9.99 in |  | North America | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| 35 mm slide | 11.25 × 7.5 in |  | International | [Microsoft Support, "Change the size of your slides"](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) |
| Square carousel deck | 1080 × 1080 px |  | International | Unverified. [LinkedIn Help, "Upload and share documents on LinkedIn"](https://www.linkedin.com/help/linkedin/answer/a518909), [PostNitro, "LinkedIn carousel PDF size and format guide"](https://postnitro.ai/blog/post/linkedin-carousel-pdf-size-and-format-complete-guide-2024), [Meta Business Help, "Design Specifications for Carousel Ads"](https://www.facebook.com/business/help/1114358518575630) |
| 4:5 carousel deck | 1080 × 1350 px |  | International | Unverified. [Instagram Help Center, "Image resolution of photos you share on Instagram"](https://help.instagram.com/1631821640426723), [PostNitro, "LinkedIn carousel PDF size and format guide"](https://postnitro.ai/blog/post/linkedin-carousel-pdf-size-and-format-complete-guide-2024) |
| 3:4 carousel deck | 1080 × 1440 px |  | International | Unverified. [Instagram Help Center, "Image resolution of photos you share on Instagram"](https://help.instagram.com/1631821640426723) |
| 9:16 vertical deck | 1080 × 1920 px |  | International | Unverified. [SlideModel, "How to Make a Canva Slide Vertical"](https://slidemodel.com/how-to-make-a-canva-slide-vertical/) |
| Pitch deck PDF (16:9) | 1920 × 1080 px |  | International | Unverified. [Template.net, "Pitch deck sizes"](https://www.template.net/graphic-design/pitch-deck-sizes) |
| Webinar / screen-share slide | 1920 × 1080 px |  | International | Unverified. [Bitesize Bio, "Guide for educational webinar presenters" (Feb 2026)](https://bitesizebio.com/wp-content/uploads/2026/02/Guide-for-educational-webinar-presenters-10-Feb-26.pdf) |
| Conference talk slide | 1920 × 1080 px |  | International | [European Society of Cardiology, "Speaker Guidelines" (Cardio-Oncology congress)](https://www.escardio.org/events/congresses/esc-cardio-oncology/scientific-sessions/faculty-and-presenters/speaker-guidelines/) |
| Academic poster A0 | 841 × 1189 mm | 3 mm | International, Europe, Asia | [VLIZ / IKUWA8, "Poster presentation guidelines"](https://www.vliz.be/ikuwa8/en/poster-presentation-guidelines), [Markus Kuhn, "International standard paper sizes" (ISO 216)](https://www.nhn.ou.edu/~huanggs/iso-paper), [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |
| Academic poster A1 | 594 × 841 mm | 3 mm | International, Europe | [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/), [Markus Kuhn, "International standard paper sizes" (ISO 216)](https://www.nhn.ou.edu/~huanggs/iso-paper) |
| Academic poster 48×36 in | 48 × 36 in | 0.125 in | North America | Unverified. [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |
| Academic poster 42×30 in | 42 × 30 in | 0.125 in | North America | Unverified. [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |
| Academic poster 36×24 in | 36 × 24 in | 0.125 in | North America | Unverified. [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |
| A0 poster (Japan board) | 841 × 1189 mm | 3 mm | Japan | [Yukawa Institute, Kyoto University, "Poster Session"](https://www2.yukawa.kyoto-u.ac.jp/~jam/PosterSession.php) |
| E-poster (16:9 screen) | 1920 × 1080 px |  | International | Unverified. [Fourwaves, "Standard poster size for academic conferences"](https://fourwaves.com/blog/standard-poster-size-for-academic-conference/) |

### Paper

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| A4 | 210 × 297 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [instantprint, A4 booklet print specifications (3 mm bleed, 3 mm safe zone)](https://www.instantprint.co.uk/stapled-booklets/a4), [Trade Printing UK, Flyer & leaflet printing specs (3 mm bleed)](https://tradeprintinguk.com/flyers-leaflets-printing) |
| A5 | 148 × 210 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Barnoprint, A5 flyers artwork guide (3 mm bleed, 3 mm safe zone)](https://www.barnoprint.co.uk/wp-content/uploads/art-guide/download/a5-flyers.pdf) |
| A3 | 297 × 420 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Trade Printing UK, Flyer & leaflet printing specs (3 mm bleed)](https://tradeprintinguk.com/flyers-leaflets-printing) |
| A6 | 105 × 148 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [PrintTogether, Artwork guide book (3 mm bleed flat items, A6 card)](https://www.printtogether.com.au/pdf/Art-Specs.pdf) |
| A2 | 420 × 594 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| A1 | 594 × 841 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| A0 | 841 × 1189 mm | 3 mm | International | [ISO 216:2007 Writing paper and certain classes of printed matter, Trimmed sizes, A and B series](https://www.iso.org/standard/36631.html), [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| A7 | 74 × 105 mm | 3 mm | International | [ISO 216:2007 Writing paper and certain classes of printed matter, Trimmed sizes, A and B series](https://www.iso.org/standard/36631.html), [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards) |
| B0 | 1000 × 1414 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| B1 | 707 × 1000 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| B2 | 500 × 707 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| B3 | 353 × 500 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| B4 | 250 × 353 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| B5 | 176 × 250 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| B6 | 125 × 176 mm | 3 mm | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards) |
| B7 | 88 × 125 mm | 3 mm | International | [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size), [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards) |
| C3 | 324 × 458 mm |  | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| C4 | 229 × 324 mm |  | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| C5 | 162 × 229 mm |  | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| C6 | 114 × 162 mm |  | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html) |
| DL envelope | 220 × 110 mm |  | International | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Packaging Box US, Standard envelope sizes (DL, #10)](https://packagingbox.us/standard-envelope-sizes) |
| C6/C5 envelope | 229 × 114 mm |  | Europe | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| US Letter | 8.5 × 11 in | 0.125 in | US, Canada, Mexico, Latin America | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size), [Printing Partners, Understanding printer bleed (0.125 in standard)](https://www.printingpartners.net/printing-knowledge-library/what-is-printer-bleed) |
| US Legal | 8.5 × 14 in | 0.125 in | US, Canada | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| Tabloid | 11 × 17 in | 0.125 in | US, Canada, Latin America | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| Ledger | 17 × 11 in | 0.125 in | US, Canada | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| Executive | 7.25 × 10.5 in | 0.125 in | US | [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| Half Letter (Statement) | 5.5 × 8.5 in | 0.125 in | US, Canada | [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| ANSI C | 17 × 22 in |  | US | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| ANSI D | 22 × 34 in |  | US | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| ANSI E | 34 × 44 in |  | US | [Markus Kuhn, International standard paper sizes (ISO 216/269, ANSI, US formats)](https://www.cl.cam.ac.uk/~mgk25/iso-paper.html), [Paper size, Wikipedia](https://en.wikipedia.org/wiki/Paper_size) |
| JIS B4 | 257 × 364 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B5 | 182 × 257 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B6 | 128 × 182 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B3 | 364 × 515 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B2 | 515 × 728 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B1 | 728 × 1030 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B0 | 1030 × 1456 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| JIS B7 | 91 × 128 mm | 3 mm | Japan | [MarcArea, Paper size standards (ISO A/B and JIS B tables)](https://marcarea.com/weblog/2026/01/03/paper-size-standards), [JIS規格ポケットブック, 用紙のサイズ・寸法一覧 (JIS P 0138)](https://jis.jts-tokyo.com/kami-size-siagari/) |
| #10 envelope | 9.5 × 4.125 in |  | US, Canada | [Packaging Box US, Standard envelope sizes (DL, #10)](https://packagingbox.us/standard-envelope-sizes), [AlphaGraphics, Standard #10 envelope template (no bleed, USPS barcode area)](https://www.alphagraphics.com/us-tennessee-franklin-us630/file%20library/uc630_templates/alphagraphics-no10-env-template.pdf), [EnvyPak, Envelope size chart](https://www.envypak.com/envelope-size-chart) |
| A7 envelope | 7.25 × 5.25 in |  | US, Canada | [EnvyPak, Envelope size chart](https://www.envypak.com/envelope-size-chart), [Greener Printer, Print guidelines – envelope templates (A7 5.25 × 7.25 in)](https://www.greenerprinter.com/print-guidelines/product-templates/z-fold) |

### Cards and stationery

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| Business card (US) | 3.5 × 2 in | 0.125 in | North America | [Print Peppermint, Business card sizes: US, European and credit-card dimensions](https://www.printpeppermint.com/guides/sizes/business-cards), [4OVER4, Business Card Size Guide - cm, Inches, Pixels](https://www.4over4.com/guide/business-card-size-dimensions-guide-in-cm-px) |
| Business card (EU/UK) | 85 × 55 mm | 3 mm | Europe, UK | [Print Peppermint, Business card sizes: US, European and credit-card dimensions](https://www.printpeppermint.com/guides/sizes/business-cards), [4OVER4, Business Card Size Guide - cm, Inches, Pixels](https://www.4over4.com/guide/business-card-size-dimensions-guide-in-cm-px) |
| Credit-card size (ISO ID-1 / CR80) | 85.6 × 53.98 mm |  | International | [ISO/IEC 7810:2003 Identification cards, Physical characteristics](https://www.iso.org/standard/31432.html), [Print Peppermint, Business card sizes: US, European and credit-card dimensions](https://www.printpeppermint.com/guides/sizes/business-cards) |
| Business card (Japan, meishi) | 91 × 55 mm | 3 mm | Japan | [Irie Design, 名刺サイズ完全ガイド (Japanese business card size guide, 91 × 55 mm, 3 mm bleed)](https://www.irie-design.com/blog/business-card-size-guide.html), [OHPRINT.ME, 명함 사이즈 90×50 vs 85×55 (Korean business card size guide)](https://www.ohprint.me/blog/business-card-size-guide-90x50-85x55) |
| Business card (Australia/NZ) | 90 × 55 mm | 3 mm | Australia, New Zealand, Scandinavia | [4OVER4, Business Card Size Guide - cm, Inches, Pixels](https://www.4over4.com/guide/business-card-size-dimensions-guide-in-cm-px) |
| Business card (Korea, Brazil) | 90 × 50 mm |  | Korea, Latin America | Unverified. [OHPRINT.ME, 명함 사이즈 90×50 vs 85×55 (Korean business card size guide)](https://www.ohprint.me/blog/business-card-size-guide-90x50-85x55), [Gráfica Boa Vista, Dimensões do Cartão de Visita (Brazil 9 × 5 cm)](https://graficaboavista.com.br/cartao-visita-tamanho-2) |
| Square business card | 2.5 × 2.5 in | 0.125 in | International | [Print Peppermint, Business Card Sizes, Standard & Custom Dimensions](https://www.printpeppermint.com/guides/essentials/business-card-sizes) |
| Postcard 4 × 6 in | 4 × 6 in | 0.125 in | North America | [4OVER4, Standard Postcard Sizes and Dimensions](https://www.4over4.com/guide/standard-postcard-sizes-and-dimensions-guide), [Vograce, Postcard Size Guide: Standard Sizes, Pixels & Mailing Rules](https://vograce.com/blogs/news/postcard-size-guide) |
| Postcard 4.25 × 6 in (USPS max) | 4.25 × 6 in | 0.125 in | US | [Vograce, Postcard Size Guide: Standard Sizes, Pixels & Mailing Rules](https://vograce.com/blogs/news/postcard-size-guide), [USPS Postal Explorer, Sizes for Postcards](https://pe.usps.com/businessmail101?ViewName=Cards) |
| Postcard 5 × 7 in | 5 × 7 in | 0.125 in | North America | [4OVER4, Standard Postcard Sizes and Dimensions](https://www.4over4.com/guide/standard-postcard-sizes-and-dimensions-guide) |
| Postcard 5.5 × 8.5 in | 5.5 × 8.5 in | 0.125 in | North America | [4OVER4, Standard Postcard Sizes and Dimensions](https://www.4over4.com/guide/standard-postcard-sizes-and-dimensions-guide) |
| Postcard 6 × 9 in | 6 × 9 in | 0.125 in | North America | [4OVER4, Standard Postcard Sizes and Dimensions](https://www.4over4.com/guide/standard-postcard-sizes-and-dimensions-guide) |
| Postcard 6 × 11 in (jumbo) | 6 × 11 in | 0.125 in | North America | [4OVER4, Standard Postcard Sizes and Dimensions](https://www.4over4.com/guide/standard-postcard-sizes-and-dimensions-guide) |
| Postcard A6 | 105 × 148 mm | 3 mm | International, Europe | [Craftific, Printable Page Size + Bleed Converter](https://craftific.com/tools/printable-page-size-bleed-converter), [Printer guide "Understanding Paper Sizes" (A-sizes incl. 3 mm bleed)](https://assets.ctfassets.net/d3bnr0l99nhx/43GVQx0COsk6ZjgHKreAgo/62980b392fabfa8307c2b61a2cf5b661/Paper_Sizes_-_A_Guide_to_Standard_Paper_Sizes.pdf) |
| Postcard (Japan, hagaki) | 100 × 148 mm | 3 mm | Japan | [Japan Post, Standard Mail Services (letter, postcard)](https://www.post.japanpost.jp/service/standard/index_en.html), [Craftific, Printable Page Size + Bleed Converter](https://craftific.com/tools/printable-page-size-bleed-converter) |
| Greeting card A2 (folded) | 4.25 × 5.5 in | 0.125 in | North America | [4OVER4, Standard Greeting Card Sizes in Inches](https://www.4over4.com/guide/quick-guide-to-standard-greeting-card-sizes), [4OVER4, Standard Invitation Sizes and the Envelopes That Match Them](https://www.4over4.com/.well-known/okf/guide/invitation-sizes-the-complete-guide.md) |
| Greeting card US A6 (folded) | 4.5 × 6.25 in | 0.125 in | North America | [4OVER4, Standard Greeting Card Sizes in Inches](https://www.4over4.com/guide/quick-guide-to-standard-greeting-card-sizes) |
| Greeting card / invitation A7 5 × 7 (folded) | 5 × 7 in | 0.125 in | North America | [4OVER4, Standard Greeting Card Sizes in Inches](https://www.4over4.com/guide/quick-guide-to-standard-greeting-card-sizes), [4OVER4, Standard Invitation Sizes and the Envelopes That Match Them](https://www.4over4.com/.well-known/okf/guide/invitation-sizes-the-complete-guide.md) |
| Greeting card A9 (folded) | 5.5 × 8.5 in | 0.125 in | North America | [4OVER4, Standard Greeting Card Sizes in Inches](https://www.4over4.com/guide/quick-guide-to-standard-greeting-card-sizes) |
| Square greeting card 6 × 6 in | 6 × 6 in | 0.125 in | North America | [4OVER4, Standard Greeting Card Sizes in Inches](https://www.4over4.com/guide/quick-guide-to-standard-greeting-card-sizes) |
| Greeting card A6 (folded) | 105 × 148 mm | 3 mm | Europe, UK, International | [OXO Packaging, A Comprehensive Guide on the Dimensions of Greeting Card](https://oxopackaging.com/blog/greeting-card-dimensions.html), [Printer guide "Understanding Paper Sizes" (A-sizes incl. 3 mm bleed)](https://assets.ctfassets.net/d3bnr0l99nhx/43GVQx0COsk6ZjgHKreAgo/62980b392fabfa8307c2b61a2cf5b661/Paper_Sizes_-_A_Guide_to_Standard_Paper_Sizes.pdf) |
| Greeting card A5 (folded) | 148 × 210 mm | 3 mm | Europe, UK, International | [OXO Packaging, A Comprehensive Guide on the Dimensions of Greeting Card](https://oxopackaging.com/blog/greeting-card-dimensions.html), [Printer guide "Understanding Paper Sizes" (A-sizes incl. 3 mm bleed)](https://assets.ctfassets.net/d3bnr0l99nhx/43GVQx0COsk6ZjgHKreAgo/62980b392fabfa8307c2b61a2cf5b661/Paper_Sizes_-_A_Guide_to_Standard_Paper_Sizes.pdf) |
| Square greeting card 150 mm | 150 × 150 mm | 3 mm | Europe, UK | Unverified. [OXO Packaging, A Comprehensive Guide on the Dimensions of Greeting Card](https://oxopackaging.com/blog/greeting-card-dimensions.html) |
| RSVP / small notecard (A1) | 3.5 × 5 in | 0.125 in | North America | [4OVER4, Standard Invitation Sizes and the Envelopes That Match Them](https://www.4over4.com/.well-known/okf/guide/invitation-sizes-the-complete-guide.md), [USPS Postal Explorer, Sizes for Postcards](https://pe.usps.com/businessmail101?ViewName=Cards) |
| Notecard 3 × 5 in | 3 × 5 in | 0.125 in | North America | Unverified. [OXO Packaging, A Comprehensive Guide on the Dimensions of Greeting Card](https://oxopackaging.com/blog/greeting-card-dimensions.html) |
| Letterhead A4 | 210 × 297 mm | 3 mm | International, Europe | [Printer artwork template, Letterhead A4 (210 × 297 mm, 3 mm bleed)](https://assets.ctfassets.net/d3bnr0l99nhx/4BAbXHy3VkFcZZCRhiV09x/619a254cf9fc93c6eb278a93c252c0bd/Letterhead_-_A4_-_Double_Sided.pdf) |
| Letterhead US Letter | 8.5 × 11 in | 0.125 in | North America | [Printability, Letter Size Paper (8.5 x 11)](https://www.printability.app/learn/paper-sizes/us-sizes/letter-size), [4OVER4, Certificate Sizes for Awards, Diplomas and Gift Certificates](https://www.4over4.com/.well-known/okf/guide/certificate-sizes-the-complete-guide.md) |
| Compliment slip DL (1/3 A4) | 210 × 99 mm | 3 mm | UK, Europe, Australia | [Adobe Express UK, Compliment slip size](https://www.adobe.com/uk/express/discover/sizes/compliment-slip), [Tradeprint, Compliment Slips (3 mm bleed)](https://www.tradeprint.co.uk/stationery/compliment-slips), [Graphic Design Employment, Compliment Slip Paper Size (1/3 A4, also tickets)](https://www.graphic-design-employment.com/compliment-slip-paper-size.html) |
| Compliment slip A6 | 148 × 105 mm | 3 mm | UK, Europe | [Adobe Express UK, Compliment slip size](https://www.adobe.com/uk/express/discover/sizes/compliment-slip) |
| Certificate A4 landscape | 297 × 210 mm | 3 mm | International | [4OVER4, Certificate Sizes for Awards, Diplomas and Gift Certificates](https://www.4over4.com/.well-known/okf/guide/certificate-sizes-the-complete-guide.md), [Printer artwork template, Letterhead A4 (210 × 297 mm, 3 mm bleed)](https://assets.ctfassets.net/d3bnr0l99nhx/4BAbXHy3VkFcZZCRhiV09x/619a254cf9fc93c6eb278a93c252c0bd/Letterhead_-_A4_-_Double_Sided.pdf) |
| Certificate US Letter landscape | 11 × 8.5 in | 0.125 in | North America | [4OVER4, Certificate Sizes for Awards, Diplomas and Gift Certificates](https://www.4over4.com/.well-known/okf/guide/certificate-sizes-the-complete-guide.md) |
| Certificate 8 × 10 in landscape | 10 × 8 in | 0.125 in | North America | [4OVER4, Certificate Sizes for Awards, Diplomas and Gift Certificates](https://www.4over4.com/.well-known/okf/guide/certificate-sizes-the-complete-guide.md) |
| Gift certificate 8.5 × 3.67 in | 8.5 × 3.67 in | 0.125 in | North America | [4OVER4, Certificate Sizes for Awards, Diplomas and Gift Certificates](https://www.4over4.com/.well-known/okf/guide/certificate-sizes-the-complete-guide.md) |
| Event ticket 5.5 × 2 in | 5.5 × 2 in | 0.125 in | North America | [PrintPlace, Ticket Printing](https://www.printplace.com/products/tickets), [UPrinting, Event Ticket Printing](https://www.uprinting.com/event-ticket-printing.html) |
| Event ticket 5.5 × 2.75 in | 5.5 × 2.75 in | 0.125 in | North America | [PrintPlace, Ticket Printing](https://www.printplace.com/products/tickets), [UPrinting, Event Ticket Printing](https://www.uprinting.com/event-ticket-printing.html) |
| Event ticket 7 × 2 in | 7 × 2 in | 0.125 in | North America | [Printkeg, Custom Bookmark Printing, Event Tickets & Hang Tags](https://www.printkeg.com/collections/bookmarks-tickets) |
| Event ticket 8.5 × 2.75 in | 8.5 × 2.75 in | 0.125 in | North America | [PrintPlace, Ticket Printing](https://www.printplace.com/products/tickets), [UPrinting, Event Ticket Printing](https://www.uprinting.com/event-ticket-printing.html) |
| Event ticket 8.5 × 3.5 in | 8.5 × 3.5 in | 0.125 in | North America | [PrintPlace, Ticket Printing](https://www.printplace.com/products/tickets), [UPrinting, Event Ticket Printing](https://www.uprinting.com/event-ticket-printing.html) |
| Ticket DL (1/3 A4) | 210 × 99 mm | 3 mm | UK, Europe | [Tradeprint, Compliment Slips (3 mm bleed)](https://www.tradeprint.co.uk/stationery/compliment-slips), [Graphic Design Employment, Compliment Slip Paper Size (1/3 A4, also tickets)](https://www.graphic-design-employment.com/compliment-slip-paper-size.html) |
| Bookmark 2 × 6 in | 2 × 6 in | 0.125 in | North America | [Printkeg, Custom Bookmark Printing, Event Tickets & Hang Tags](https://www.printkeg.com/collections/bookmarks-tickets), [ClubFlyers, Custom 2x6 Bookmarks Printing](https://www.clubflyers.com/printing/bookmark/2x6) |
| Bookmark 2 × 7 in | 2 × 7 in | 0.125 in | North America | [Printkeg, Custom Bookmark Printing, Event Tickets & Hang Tags](https://www.printkeg.com/collections/bookmarks-tickets) |
| Bookmark 2 × 8 in | 2 × 8 in | 0.125 in | North America | [Printkeg, Custom Bookmark Printing, Event Tickets & Hang Tags](https://www.printkeg.com/collections/bookmarks-tickets), [ClubFlyers, Custom 2x6 Bookmarks Printing](https://www.clubflyers.com/printing/bookmark/2x6) |
| Gift / hang tag 2 × 3.5 in | 2 × 3.5 in | 0.125 in | North America | [UPrinting, Gift Tags](https://www.uprinting.com/gift-tag-printing.html), [VistaPrint, Custom Printed Gift Tags](https://www.vistaprint.com/photo-gifts/gift-tags) |
| Gift / hang tag 2 × 4 in | 2 × 4 in | 0.125 in | North America | [UPrinting, Gift Tags](https://www.uprinting.com/gift-tag-printing.html) |
| Gift / hang tag 2.5 × 2.5 in | 2.5 × 2.5 in | 0.125 in | North America | [UPrinting, Gift Tags](https://www.uprinting.com/gift-tag-printing.html), [VistaPrint, Custom Printed Gift Tags](https://www.vistaprint.com/photo-gifts/gift-tags) |
| Place card (tent, folded) | 3.5 × 2 in | 0.125 in | North America | [Printleaf, Table Tent Cards / Custom Place Cards (3.5 × 4 in flat)](https://www.printleaf.com/table-tent-cards), [Place Card Me, Printable Table Name Cards (3.5 × 2 in folded and flat)](https://www.placecardme.com/name-cards/) |
| Place / table tent card large (folded) | 5 × 3.5 in | 0.125 in | North America | [Hallstarz Print, Basic Tent Cards](https://www.hallstarzprint.com/basic-tent-cards) |

### Flyers, posters and banners

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| Flyer A4 | 210 × 297 mm | 3 mm | International, Europe, UK, AU, IN, JP, KR, LatAm | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide), [DL Flyer Size: 99 × 210 mm](https://printshop.paperlust.co/blog/dl-flyer-size-and-dimensions) |
| Flyer A5 | 148 × 210 mm | 3 mm | International, Europe, UK, AU | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide), [A5 artwork guide (148 × 210 mm, 154 × 216 mm with bleed)](https://d39eo07iavn1vt.cloudfront.net/Live/Route1Print/ProductPages/ArtworkGuides/e322ce22-48cb-4668-be3c-75a7506d4710/A5.pdf) |
| Flyer A6 | 105 × 148 mm | 3 mm | International, Europe, UK, AU | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide) |
| Flyer DL | 99 × 210 mm | 3 mm | Europe, UK, AU, NZ | [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide), [DL Flyer Size: 99 × 210 mm](https://printshop.paperlust.co/blog/dl-flyer-size-and-dimensions), [DL print template](https://print.inc/product/additional-info-file/437672/download) |
| Flyer US Letter | 8.5 × 11 in | 0.125 in | US, Canada, Mexico, parts of LatAm | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products), [What to Know About Flyer Size](https://zoeprint.com/page/flyer-size) |
| Flyer half letter | 5.5 × 8.5 in | 0.125 in | US, Canada | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products), [What to Know About Flyer Size](https://zoeprint.com/page/flyer-size) |
| Flyer quarter letter | 4.25 × 5.5 in | 0.125 in | US, Canada | [What to Know About Flyer Size](https://zoeprint.com/page/flyer-size) |
| Flyer 4×6 | 4 × 6 in | 0.125 in | US, Canada | [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products), [What to Know About Flyer Size](https://zoeprint.com/page/flyer-size) |
| Brochure Letter tri-fold (flat) | 11 × 8.5 in | 0.125 in | US, Canada | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained), [Fold design pocket guide (tri-fold panel widths)](https://www.printcographics.com/pdf/design_pocket_guide.pdf) |
| Brochure Letter tri-fold (folded panel) | 3.67 × 8.5 in | 0.125 in | US, Canada | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained) |
| Brochure Letter bi-fold (flat) | 11 × 8.5 in | 0.125 in | US, Canada | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained) |
| Brochure Legal tri-fold (flat) | 14 × 8.5 in | 0.125 in | US, Canada | [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained), [Fold design pocket guide (tri-fold panel widths)](https://www.printcographics.com/pdf/design_pocket_guide.pdf), [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products) |
| Brochure Tabloid bi-fold (flat) | 17 × 11 in | 0.125 in | US, Canada | [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained), [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products) |
| Brochure A4 tri-fold (flat) | 297 × 210 mm | 3 mm | International, Europe, UK, AU | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide) |
| Brochure A4 bi-fold (flat) | 297 × 210 mm | 3 mm | International, Europe, UK, AU | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Flyers Size Guide (UK, with 3 mm bleed)](https://discoverprint.co.uk/blog/flyers-size-guide) |
| Brochure A3 bi-fold (flat) | 420 × 297 mm | 3 mm | International, Europe, UK | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu) |
| Rack card 4×9 | 4 × 9 in | 0.125 in | US, Canada | [Standard Brochure Sizes for Every Fold and Use](https://www.4over4.com/guide/standard-brochure-sizes-and-folds-complete-guide), [Common Brochure Sizes Guide & Dimensions](https://www.4over4.com/guide/common-brochure-sizes-and-fold-options-explained), [Brochures / Flyers product list](https://www.samedayprinting.com/brochure-printing/products) |
| Door hanger standard | 4.25 × 11 in | 0.125 in | US, Canada | [Door Hanger Size tool](https://www.4over4.com/tools/door-hanger-size), [Door Hanger Standard 3.5 × 8.5 template](https://storage.jukeboxprint.com/design-templates/5201314-Door-Hanger---Standard---3.5-x-8.5.pdf) |
| Door hanger compact | 3.5 × 8.5 in | 0.125 in | US, Canada | [Door Hanger Size tool](https://www.4over4.com/tools/door-hanger-size), [Door Hanger Standard 3.5 × 8.5 template](https://storage.jukeboxprint.com/design-templates/5201314-Door-Hanger---Standard---3.5-x-8.5.pdf) |
| Door hanger oversized | 4.25 × 14 in | 0.125 in | US, Canada | [Door Hanger Size tool](https://www.4over4.com/tools/door-hanger-size) |
| Menu Letter | 8.5 × 11 in | 0.125 in | US, Canada, Mexico | [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu), [Common Restaurant Menu Sizes](https://www.uprinting.com/blog/menu-sizes) |
| Menu Legal (tall) | 8.5 × 14 in | 0.125 in | US, Canada | [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu), [Common Restaurant Menu Sizes](https://www.uprinting.com/blog/menu-sizes), [Menu Printing sizes](https://www.musthavemenus.com/feature/menu-printing.html) |
| Menu Tabloid | 11 × 17 in | 0.125 in | US, Canada | [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu), [Common Restaurant Menu Sizes](https://www.uprinting.com/blog/menu-sizes) |
| Menu slim (drinks) | 4.25 × 11 in | 0.125 in | US, Canada | [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu), [Common Restaurant Menu Sizes](https://www.uprinting.com/blog/menu-sizes) |
| Menu A4 | 210 × 297 mm | 3 mm | International, Europe, UK, AU, IN | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu) |
| Menu A3 | 297 × 420 mm | 3 mm | International, Europe, UK, AU | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu) |
| Menu A5 | 148 × 210 mm | 3 mm | International, Europe, UK, AU | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Menu Size Guide: Restaurant Menu Dimensions](https://agl.rs/tools/print-sizes/menu) |
| Poster 11×17 (Tabloid) | 11 × 17 in | 0.125 in | US, Canada | [Standard Poster Sizes, Complete Guide](https://www.framedestination.com/blog/resources/the-most-common-poster-sizes), [Standard Poster Sizes Guide](https://www.clashgraphics.com/printing-tips/standard-poster-sizes-guide) |
| Poster 12×18 | 12 × 18 in | 0.125 in | US, Canada | [Standard Poster Sizes Guide](https://www.clashgraphics.com/printing-tips/standard-poster-sizes-guide), [Standard Poster Sizes, US & UK chart](https://printframeco.com/blogs/tips/standard-poster-sizes) |
| Poster 18×24 | 18 × 24 in | 0.125 in | US, Canada | [Standard Poster Sizes, Complete Guide](https://www.framedestination.com/blog/resources/the-most-common-poster-sizes), [Standard Poster Sizes Guide](https://www.clashgraphics.com/printing-tips/standard-poster-sizes-guide), [Standard Poster Sizes, US & UK chart](https://printframeco.com/blogs/tips/standard-poster-sizes) |
| Poster 24×36 | 24 × 36 in | 0.125 in | US, Canada | [Standard Poster Sizes, Complete Guide](https://www.framedestination.com/blog/resources/the-most-common-poster-sizes), [Standard Poster Sizes Guide](https://www.clashgraphics.com/printing-tips/standard-poster-sizes-guide), [Standard Poster Sizes, US & UK chart](https://printframeco.com/blogs/tips/standard-poster-sizes) |
| Movie one-sheet 27×40 | 27 × 40 in | 0.125 in | US, international cinema | [Standard Poster Sizes, Complete Guide](https://www.framedestination.com/blog/resources/the-most-common-poster-sizes), [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster 40×60 (bus stop / subway) | 40 × 60 in |  | US, UK (as 4-sheet) | [Standard Poster Sizes, US & UK chart](https://printframeco.com/blogs/tips/standard-poster-sizes), [Billboard Sizes UK (4-sheet to 96-sheet)](https://www.billboardadvertising.org.uk/size/all-sizes/berkshire) |
| UK quad (landscape) | 40 × 30 in |  | UK | [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster A3 | 297 × 420 mm | 3 mm | International, Europe, UK, AU, IN, JP, KR | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm), [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster A2 | 420 × 594 mm | 3 mm | International, Europe, UK, AU, IN, JP, KR | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm), [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster A1 | 594 × 841 mm | 3 mm | International, Europe, UK, AU, IN, JP, KR | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm), [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster A0 | 841 × 1189 mm | 3 mm | International, Europe, UK, AU, IN, JP, KR | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm), [Poster Sizes (movie and UK cinema formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster B2 (ISO) | 500 × 707 mm | 3 mm | International, Europe | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster B1 (ISO) | 707 × 1000 mm | 3 mm | International, Europe | [ISO 216:2007 Writing paper and certain classes of printed matter, A and B series](https://www.iso.org/standard/36631.html), [Poster Sizes (A series and UK formats)](https://www.papersizes.org/poster-sizes.htm) |
| Poster B2 (JIS) | 515 × 728 mm | 3 mm | Japan | [Japanese Paper Sizes, JIS A and JIS B](https://www.papersizes.org/japanese-sizes.htm) |
| Poster B1 (JIS) | 728 × 1030 mm | 3 mm | Japan | [Japanese Paper Sizes, JIS A and JIS B](https://www.papersizes.org/japanese-sizes.htm) |
| Poster 50×70 cm | 500 × 700 mm | 3 mm | Europe | Unverified. [Standard Poster Sizes, US & UK chart](https://printframeco.com/blogs/tips/standard-poster-sizes) |
| Roll-up banner 850 | 850 × 2000 mm | 3 mm | Europe, UK, AU | [Standard roller banner 850 mm graphic template](https://ghdisplay.b-cdn.net/app/uploads/2026/07/standard-roller-banner-850mm-graphic-template.pdf), [Quick Artwork Guide, Roll-up banners](https://assets.ctfassets.net/wm1n7oady8a5/2eih6r2EWRFIEc9pKk0nzQ/3973332e12d31dcc4a37ace85eca62fc/Quick_Artwork_Guide_-_English_-_Signage_-_Rollup_banners.pdf), [Deluxe 850 mm Roll Up Banner template](https://media.promobrands.com.au/app/uploads/RB191-850-The-Deluxe-850mm-Roll-Up-Banner-2.pdf) |
| Roll-up banner 800 | 800 × 2000 mm | 3 mm | Europe, UK | [Roller Banner Size Guide](https://www.bannerworld.co.uk/blog/exhibition-display/roller-banner-size-guide-standard-dimensions-explained/) |
| Roll-up banner 1000 | 1000 × 2000 mm | 3 mm | Europe, UK | [Roller Banner Size Guide](https://www.bannerworld.co.uk/blog/exhibition-display/roller-banner-size-guide-standard-dimensions-explained/) |
| Retractable banner 33×81 | 33 × 81 in |  | US, Canada | [Typical Banner Sizes for Print and Digital](https://www.4over4.com/guide/typical-banner-sizes-for-events-and-displays), [Blade Lite 850 Retractable Banner Stand](https://www.camelbackdisplays.com/product/blade-lite-850-retractable-banner-stand) |
| Retractable banner 47×81 | 47 × 81 in |  | US, Canada | [Typical Banner Sizes for Print and Digital](https://www.4over4.com/guide/typical-banner-sizes-for-events-and-displays) |
| Vinyl banner 2×4 ft | 48 × 24 in | 1 in | US, Canada | [Typical Banner Sizes for Print and Digital](https://www.4over4.com/guide/typical-banner-sizes-for-events-and-displays), [Vinyl Banners: Safe Zone for Printing](https://www.banners.com/resources/what-is-the-safe-zone-for-printing) |
| Vinyl banner 3×6 ft | 72 × 36 in | 1 in | US, Canada | [Typical Banner Sizes for Print and Digital](https://www.4over4.com/guide/typical-banner-sizes-for-events-and-displays), [Vinyl Banners: Safe Zone for Printing](https://www.banners.com/resources/what-is-the-safe-zone-for-printing) |
| Vinyl banner 4×8 ft | 96 × 48 in | 1 in | US, Canada | [Typical Banner Sizes for Print and Digital](https://www.4over4.com/guide/typical-banner-sizes-for-events-and-displays), [Vinyl Banners: Safe Zone for Printing](https://www.banners.com/resources/what-is-the-safe-zone-for-printing) |
| Yard sign 24×18 | 24 × 18 in | 0.125 in | US, Canada | [Yard Sign 24 × 18 design guidelines](https://content.mimeo.com/templates/Guidelines_YardSign_24_18_Duplex-v1.pdf), [Custom Yard Signs](https://www.staples.com/services/printing/yard-lawn-signs), [24 × 18 Custom Outdoor Yard Sign](https://www.yardsignplus.com/shop/custom-18x24-yard-sign) |
| Yard sign 18×12 | 18 × 12 in | 0.125 in | US, Canada | [Custom Yard Signs](https://www.staples.com/services/printing/yard-lawn-signs), [24 × 18 Custom Outdoor Yard Sign](https://www.yardsignplus.com/shop/custom-18x24-yard-sign) |
| Trade show backdrop 10×8 ft | 120 × 96 in |  | US, Canada | [Portable Backdrops for Booth and Media Events](https://bluewaveprinting.com/booth-backdrops), [10 ft Fabric Pop Up Display](https://www.signking.com/Banners-and-Stands/Step-and-Repeat-Walls/10ft-Fabric-Pop-Up.html) |
| Trade show backdrop 8×8 ft | 96 × 96 in |  | US, Canada | [Portable Backdrops for Booth and Media Events](https://bluewaveprinting.com/booth-backdrops), [Custom Step and Repeat Banner](https://www.helloprint.com/en-us/stepandrepeatbannersus) |
| Trade show backdrop 20×8 ft, at 1:10 scale | 24 × 9.6 in (full size 240 × 96 in) |  | US, Canada | [Portable Backdrops for Booth and Media Events](https://bluewaveprinting.com/booth-backdrops) |
| Billboard 48-sheet, at 1:10 scale | 609.6 × 304.8 mm (full size 6096 × 3048 mm) | 10 mm | UK, Ireland | [48-sheet Billboards Specification](https://specle.net/uk/clear-channel/48-sheet-billboards-specification), [96, 48 & 6 Sheet Posters](https://www.digitalprinting.co.uk/products/96-48-6-sheet-posters/29) |
| Billboard 96-sheet, at 1:10 scale | 1219.2 × 304.8 mm (full size 12192 × 3048 mm) | 10 mm | UK, Ireland | [96, 48 & 6 Sheet Posters](https://www.digitalprinting.co.uk/products/96-48-6-sheet-posters/29), [48 Sheets, Planning and Buying](https://www.billboardadvertising.org.uk/size/48-sheet) |
| 6-sheet (bus shelter) | 1200 × 1800 mm |  | UK, Ireland | [96, 48 & 6 Sheet Posters](https://www.digitalprinting.co.uk/products/96-48-6-sheet-posters/29), [48 Sheets, Planning and Buying](https://www.billboardadvertising.org.uk/size/48-sheet) |
| Großfläche 18/1 | 3560 × 2520 mm |  | Germany, Austria | [Formate der Plakatwerbung](https://www-cdn.crossvertise.com/production/docs/default-source/documents-plakatwerbung/formate-plakatwerbung.pdf), [Billboard & City Star Board 18/1 Media Production 2026](https://www.stroeer.de/media/02_downloads/planen_und_buchen/aussenwerbung/plakatmedien/medienproduktion_2026/englisch/en_bb_cs_mediaproduction_2026.pdf) |
| City-Light-Poster 4/1 | 1185 × 1750 mm |  | Germany, Austria, Switzerland | [Formate der Plakatwerbung](https://www-cdn.crossvertise.com/production/docs/default-source/documents-plakatwerbung/formate-plakatwerbung.pdf), [City Light production specs](https://www.werbering.at/produkte/city-light) |
| US bulletin 14×48 ft, at 1:10 scale | 57.6 × 16.8 in (full size 576 × 168 in) | 6 in | US, Canada | [OAAA Bulletins](https://oaaa.org/resources/bulletins/), [OAAA OOH Print Production Specifications Cheat Sheet](https://oaaa.org/wp-content/uploads/2022/09/OOH-Print-Production-Specifications-Cheat-Sheet.pdf) |
| US junior bulletin 10.5×36 ft, at 1:10 scale | 43.2 × 12.6 in (full size 432 × 126 in) | 6 in | US | [OAAA Bulletins](https://oaaa.org/resources/bulletins/), [OAAA OOH Print Production Specifications Cheat Sheet](https://oaaa.org/wp-content/uploads/2022/09/OOH-Print-Production-Specifications-Cheat-Sheet.pdf) |
| US poster (30-sheet), at 1:10 scale | 27.2 × 12.5 in (full size 272 × 125 in) |  | US | [OAAA OOH Print Production Specifications Cheat Sheet](https://oaaa.org/wp-content/uploads/2022/09/OOH-Print-Production-Specifications-Cheat-Sheet.pdf), [OAAA Posters](https://oaaa.org/resources/posters/) |
| US junior poster (8-sheet) | 132 × 60 in |  | US | [OAAA JR Posters](https://oaaa.org/resources/jr-posters) |

### Photo prints and labels

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| Photo print 4×6 | 4 × 6 in |  | North America, International | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 5×7 | 5 × 7 in |  | North America, International | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 8×10 | 8 × 10 in |  | North America, International | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 8.5×11 | 8.5 × 11 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 11×14 | 11 × 14 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 12×18 | 12 × 18 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 16×20 | 16 × 20 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 20×30 | 20 × 30 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Square print 8×8 | 8 × 8 in |  | North America, International | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Square print 12×12 | 12 × 12 in |  | North America, International | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Photo print 9×13 cm | 90 × 130 mm |  | Europe | [CEWE, Fotoabzüge](https://www.cewe.de/fotoabzuege.html) |
| Photo print 10×15 cm | 100 × 150 mm |  | Europe, International | [CEWE, Fotoabzüge](https://www.cewe.de/fotoabzuege.html) |
| Photo print 13×18 cm | 130 × 180 mm |  | Europe | [CEWE, Fotoabzüge](https://www.cewe.de/fotoabzuege.html) |
| Photo print 15×20 cm | 150 × 200 mm |  | Europe | [CEWE, Welche Fotoformate werden angeboten?](https://www.cewe.de/inspiration/welche-fotogroessen-werden-angeboten.html) |
| Photo print 20×30 cm | 200 × 300 mm |  | Europe | [CEWE, Welche Fotoformate werden angeboten?](https://www.cewe.de/inspiration/welche-fotogroessen-werden-angeboten.html) |
| Photo print 30×45 cm | 300 × 450 mm |  | Europe | [CEWE, Welche Fotoformate werden angeboten?](https://www.cewe.de/inspiration/welche-fotogroessen-werden-angeboten.html) |
| L-ban (L判) | 89 × 127 mm |  | Japan | [Canon Japan, 印画紙サイズ glossary](https://personal.canon.jp/articles/beginner/glossary/ingashisize) |
| 2L-ban (2L判) | 127 × 178 mm |  | Japan | [Canon Japan, 印画紙サイズ glossary](https://personal.canon.jp/articles/beginner/glossary/ingashisize) |
| Wallet photo | 2.5 × 3.5 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| Mini wallet | 1.75 × 2.5 in |  | North America | [Nations Photo Lab, Best Resolutions for Printing Pictures](https://www.nationsphotolab.com/guide/image-resolution) |
| US passport/visa photo | 2 × 2 in |  | United States | [U.S. Department of State, Passport Photos](https://travel.state.gov/content/travel/en/passports/how-apply/photos.html) |
| India visa/OCI photo | 2 × 2 in |  | India | [Embassy of India Berlin, Photo specification](https://indianembassyberlin.gov.in/pdf/photo-specifiation.pdf) |
| EU/Schengen passport photo | 35 × 45 mm |  | Europe | [German Embassy, Biometric passport photos](https://hongkong.diplo.de/resource/blob/2572988/11fbf86d05a1668f0488a650e7d50aa6/biometric-passport-photos-d-e-data.pdf) |
| UK passport photo | 35 × 45 mm |  | United Kingdom | [GOV.UK, Get a passport photo: photo requirements](https://www.gov.uk/photos-for-passports/photo-requirements) |
| Canada passport photo | 50 × 70 mm |  | Canada | [Government of Canada, Passport photo requirements](https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-passports/photos.html) |
| India passport photo | 35 × 45 mm |  | India | Unverified. [Consulate General of India Toronto, ICAO Compliant Photographs for Passport Applications](https://www.cgitoronto.gov.in/docs/1756396765ICAO%20Compliant%20Photographs%20for%20Passport%20Applications.pdf) |
| India passport photo (digital) | 630 × 810 px |  | India | [Consulate General of India Toronto, ICAO Compliant Photographs for Passport Applications](https://www.cgitoronto.gov.in/docs/1756396765ICAO%20Compliant%20Photographs%20for%20Passport%20Applications.pdf) |
| Japan passport photo | 35 × 45 mm |  | Japan | [Embassy of Japan in Nigeria, Passport photo specification](https://www.ng.emb-japan.go.jp/files/100315650.pdf) |
| South Korea passport photo | 35 × 45 mm |  | South Korea | [Guri City (Korea), Passport issuance guide](https://www.guri.go.kr/eng/contents.do?key=2811) |
| Australia passport photo | 35 × 45 mm |  | Australia | [Australian Passport Office, Passport photos](https://www.passports.gov.au/passport-photos) |
| Mexico passport photo | 35 × 45 mm |  | Latin America | Unverified. [ePassportPhoto, Visa and Passport Photographs for Mexico (U)](https://epassportphoto.com/blog/visa-and-passport-photographs-mexico) |
| Brazil 3×4 document photo | 30 × 40 mm |  | Latin America | Unverified. [Smartphone-ID, Foto 3×4 para documentos (U)](https://www.smartphone-id.com/pt-br/foto-3x4) |
| Photo book small square | 7 × 7 in | 0.125 in | International | [Blurb, Book Sizes and Dimensions](https://www.blurb.co.uk/book-dimensions) |
| Photo book 8×8 | 8 × 8 in | 0.125 in | North America | [RPI Print, Self-Service print API (book sizes)](https://www.rpiprint.com/products-services/print-apis/self-service) |
| Photo book portrait 8×10 | 8 × 10 in | 0.125 in | International | [Blurb, Book Sizes and Dimensions](https://www.blurb.co.uk/book-dimensions) |
| Photo book landscape 10×8 | 10 × 8 in | 0.125 in | International | [Blurb, Book Sizes and Dimensions](https://www.blurb.co.uk/book-dimensions) |
| Photo book portrait 8.5×11 | 8.5 × 11 in | 0.125 in | North America | [RPI Print, Self-Service print API (book sizes)](https://www.rpiprint.com/products-services/print-apis/self-service) |
| Photo book landscape 11×8.5 | 11 × 8.5 in | 0.125 in | North America | [RPI Print, Self-Service print API (book sizes)](https://www.rpiprint.com/products-services/print-apis/self-service) |
| Photo book large square | 12 × 12 in | 0.125 in | International | [Blurb, Book Sizes and Dimensions](https://www.blurb.co.uk/book-dimensions) |
| Photo book large landscape | 13 × 11 in | 0.125 in | International | [Blurb, Book Sizes and Dimensions](https://www.blurb.co.uk/book-dimensions) |
| Round sticker 2 in | 2 × 2 in | 0.125 in | North America | [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Round sticker 3 in | 3 × 3 in | 0.125 in | North America | [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Square sticker 2×2 | 2 × 2 in | 0.125 in | North America | [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Square sticker 3×3 | 3 × 3 in | 0.125 in | North America | [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Rectangle sticker / product label 2×3 | 2 × 3 in | 0.125 in | North America | [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Die-cut sticker 4×4 | 4 × 4 in | 2 mm | International | [StickerApp, What is bleed and how much should it be?](https://stickerapp.com/support/artwork-design/sizes/what-is-bleed-and-how-much-should-it-be) |
| Bumper sticker | 11.5 × 3 in | 0.125 in | North America | Unverified. [4OVER4, Free Sticker Templates With Sizes, Shapes and Bleed Setup](https://www.4over4.com/guide/free-sticker-templates-guide) |
| Address label (Avery 5160) | 2.625 × 1 in |  | North America | [Avery, Avery Labels 1" x 2-5/8", such as 5160](https://www.avery.com/help/article/avery-labels-1-inch-x-2-and-5-8-inch-such-as-5160-address-labels) |
| Return address label (Avery 5167) | 1.75 × 0.5 in |  | North America | [Avery, Avery Labels 1/2" x 1-3/4"](https://www.avery.com/help/article/avery-labels-1-2-inch-x-1-and-3-4-inch) |
| Shipping label (Avery 5163) | 4 × 2 in |  | North America | [Avery, Avery Labels 2" x 4", such as 5163](https://www.avery.com/help/article/avery-labels-2-inch-x-4-inch) |
| Shipping label (Avery 5164) | 4 × 3.333 in |  | North America | [Avery, Avery Labels 3-1/3" x 4", such as 5164](https://www.avery.com/help/article/avery-labels-3-and-1-3-inch-x-4-inch) |
| Half-sheet shipping label (Avery 5126) | 8.5 × 5.5 in |  | North America | [Avery, Avery Labels 5-1/2" x 8-1/2"](https://www.avery.com/help/article/avery-labels-5-and-1-2-inch-x-8-and-1-2-inch) |
| Round label 2 in (Avery 22807) | 2 × 2 in | 0.0625 in | North America | [Avery, Template 22807 Print-to-the-Edge Round Labels 2"](https://www.avery.com/templates/22807) |
| Address label (Avery L7160) | 63.5 × 38.1 mm |  | UK, Europe | Unverified. [Hunt Office, Avery L7160 / L7163 address labels (U)](https://huntoffice.co.uk/avery-addressing-labels-laser-jam-free-14-per-sheet-991x381mm-white-ref-l7163-100-1400-labels-248572.html) |
| Address label (Avery L7163) | 99.1 × 38.1 mm |  | UK, Europe | Unverified. [Hunt Office, Avery L7160 / L7163 address labels (U)](https://huntoffice.co.uk/avery-addressing-labels-laser-jam-free-14-per-sheet-991x381mm-white-ref-l7163-100-1400-labels-248572.html) |
| Thermal shipping label 4×6 | 4 × 6 in |  | International | [UPS, Using a Thermal Printer for UPS Shipping](https://www.ups.com/in/en/support/shipping-support/print-shipping-labels/thermal-printing-of-labels) |
| Thermal shipping label 4×8 | 4 × 8 in |  | North America | [UPS, Using a Thermal Printer for UPS Shipping](https://www.ups.com/in/en/support/shipping-support/print-shipping-labels/thermal-printing-of-labels) |
| Thermal shipping label A6 | 100 × 150 mm |  | Europe, Australia | Unverified. [Micro Center, Genuine 4"x6" Direct Thermal Shipping Label (U)](https://www.microcenter.com/quickview/692553/genuine-4x6-direct-thermal-shipping-label-(500pcs) |
| Wine bottle front label | 3.5 × 4 in | 0.125 in | North America | [4OVER4, What size should a front label be for a standard 750ml wine bottle](https://www.4over4.com/faqs/labels/what-size-should-a-front-label-be-for-a-standard-750ml-wine-bottle) |
| Mason jar lid, regular mouth | 2 × 2 in | 0.125 in | North America | Unverified. [Crafts by Amanda, Labels for jars (U)](https://craftsbyamanda.com/labels-for-jars) |
| Mason jar lid, wide mouth | 3 × 3 in | 0.125 in | North America | Unverified. [Crafts by Amanda, Labels for jars (U)](https://craftsbyamanda.com/labels-for-jars) |
| CD jewel case front insert | 4.75 × 4.75 in | 0.125 in | International | [4OVER4, DVD and CD Case Dimensions, Template and Setup Guide](https://www.4over4.com/guide/dvd-and-cd-case-dimensions-template-and-setup-guide) |
| CD jewel case back tray card | 5.9 × 4.625 in | 0.125 in | International | [4OVER4, DVD and CD Case Dimensions, Template and Setup Guide](https://www.4over4.com/guide/dvd-and-cd-case-dimensions-template-and-setup-guide) |
| DVD case wrap cover | 10.75 × 7.1875 in | 0.125 in | International | [4OVER4, DVD and CD Case Dimensions, Template and Setup Guide](https://www.4over4.com/guide/dvd-and-cd-case-dimensions-template-and-setup-guide) |
| CD/DVD disc label | 120 × 120 mm |  | International | [4OVER4, DVD and CD Case Dimensions, Template and Setup Guide](https://www.4over4.com/guide/dvd-and-cd-case-dimensions-template-and-setup-guide) |

### Documents

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| A4 document | 210 × 297 mm |  | International, EU, UK, JP, KR, AU, IN, most of LatAm | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| US Letter | 8.5 × 11 in |  | US, Canada, Philippines, Mexico, Colombia, Chile, Venezuela, Costa Rica | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| US Legal | 8.5 × 14 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Folio / Oficio (long bond) | 8.5 × 13 in |  | Philippines, parts of LatAm | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Resume / CV (A4) | 210 × 297 mm |  | International, EU, UK, KR, AU, IN | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Resume (US Letter) | 8.5 × 11 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Rirekisho (A4 page) | 210 × 297 mm |  | Japan | [新たな履歴書の様式例 (Aomori Labour Bureau, MHLW)](https://jsite.mhlw.go.jp/aomori-roudoukyoku/news_topics/topics/_00051.html), [公正な採用選考のために～新たな履歴書の様式例について～ (Miyagi Prefecture)](https://www.pref.miyagi.jp/soshiki/koyou/rirekisho.html), [Rirekisho guide (Daijob)](https://www.daijob.com/en/guide/tipsadvice/resume/rirekisyo) |
| Rirekisho (B5 page) | 182 × 257 mm |  | Japan | Unverified. [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [履歴書のサイズ A4とB5 (CREX Group)](https://crexgroup.com/ja/tenshoku/career-preparation/resume-size-a4-vs-b5/) |
| Cover letter (A4) | 210 × 297 mm |  | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Cover letter (Letter) | 8.5 × 11 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Business letter DIN 5008 Form B | 210 × 297 mm |  | Germany, Austria | Unverified. [BayAGO Anlage 2, Erläuterungen zum Briefblatt (Bayern.Recht)](https://www.gesetze-bayern.de/Content/Document/BayAGO-ANL_2), [DIN 5008 (gruendung.de)](https://www.gruendung.de/din-5008/), [How to design a DIN-compliant letterhead (zoviz)](https://zoviz.com/de/blog/how-to-design-din-compliant-letterhead) |
| Business letter DIN 5008 Form A | 210 × 297 mm |  | Germany, Austria | Unverified. [BayAGO Anlage 2, Erläuterungen zum Briefblatt (Bayern.Recht)](https://www.gesetze-bayern.de/Content/Document/BayAGO-ANL_2), [How to design a DIN-compliant letterhead (zoviz)](https://zoviz.com/de/blog/how-to-design-din-compliant-letterhead) |
| DL envelope (window) | 220 × 110 mm |  | International, EU | Unverified. [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [DIN 680:2008-02 Window envelopes – Sizes and position of the window (DIN Media)](https://dinmedia.de/en/standard/din-680/102802368) |
| C5 envelope | 229 × 162 mm |  | International, EU | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [DIN 680:2008-02 Window envelopes – Sizes and position of the window (DIN Media)](https://dinmedia.de/en/standard/din-680/102802368) |
| #10 envelope (window) | 9.5 × 4.125 in |  | US, Canada | [Is there only one standard window position on a #10 window envelope? (4over4 help)](https://www.4over4.com/help/envelopes/is-there-only-one-standard-sized-window-and-window-position-on-a-10-window-envelope), [Staples #10 window envelope 4 1/8 × 9 1/2](https://www.staples.com/staples-10-window-envelope-4-1-8-x-9-1-2-white-wove-500-box-st50151-cc/product_121632) |
| Invoice (A4) | 210 × 297 mm |  | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [How to design a DIN-compliant letterhead (zoviz)](https://zoviz.com/de/blog/how-to-design-din-compliant-letterhead) |
| Invoice (Letter) | 8.5 × 11 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [Is there only one standard window position on a #10 window envelope? (4over4 help)](https://www.4over4.com/help/envelopes/is-there-only-one-standard-sized-window-and-window-position-on-a-10-window-envelope) |
| Thermal receipt 80 mm | 80 × 200 mm |  | International | [Epson TM-T20III datasheet (via ScanSource)](https://www.scansource.com/~/media/pos-and-barcode-us/brands/epson/training/pdf2/Epson-TMT20III-Datasheet-EN), [Epson TM-T88V hardware notes (Zonal knowledge base)](https://knowledge.zonal.co.uk/hardware/Content/Hardware/Point-of-Sale/Thermal/COMT-EPSONTM88V-S.htm), [Star TSP143IV product specs (LDLC)](https://www.ldlc.com/en/product/PB00748229.html) |
| Thermal receipt 58 mm | 58 × 150 mm |  | International | Unverified. [Epson TM-T20III datasheet (via ScanSource)](https://www.scansource.com/~/media/pos-and-barcode-us/brands/epson/training/pdf2/Epson-TMT20III-Datasheet-EN), [Star TSP143IV product specs (LDLC)](https://www.ldlc.com/en/product/PB00748229.html) |
| Receipt / delivery note A6 | 105 × 148 mm |  | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Report / whitepaper (A4) | 210 × 297 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Report / whitepaper (Letter) | 8.5 × 11 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Proposal (A4 landscape) | 297 × 210 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Proposal (Letter landscape) | 11 × 8.5 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Newsletter (A4) | 210 × 297 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Newsletter (Letter) | 8.5 × 11 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Newsletter (Tabloid 11×17) | 11 × 17 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Newsletter (A3) | 297 × 420 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| One-pager (A4) | 210 × 297 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| One-pager (Letter) | 8.5 × 11 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Worksheet / lesson plan (A4) | 210 × 297 mm |  | International, UK, AU, IN | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Worksheet / lesson plan (Letter) | 8.5 × 11 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Meeting agenda (A4) | 210 × 297 mm |  | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Meeting agenda (Letter) | 8.5 × 11 in |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Planner page A5 | 148 × 210 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size), [Filofax A5 Minimal To Do insert (John Lewis)](https://www.johnlewis.com/filofax-a5-minimal-to-do-personal-organiser-insert/p112212169) |
| Planner page Half Letter | 5.5 × 8.5 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Planner page A6 | 105 × 148 mm | 3 mm | International, Japan | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Planner page B6 (JIS) | 128 × 182 mm | 3 mm | Japan, Korea | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Ring planner insert Personal | 95 × 171 mm | 3 mm | UK, EU, US | Unverified. [Filofax refills (Cult Pens)](https://cultpens.com/collections/filofax-refills), [Choosing a ring bound planner (A Bowl Full of Lemons)](https://www.abowlfulloflemons.net/2015/12/choosing-a-ring-bound-planner.html) |
| Ring planner insert Pocket | 81 × 120 mm | 3 mm | UK, EU, US | Unverified. [Filofax refills (Cult Pens)](https://cultpens.com/collections/filofax-refills), [Choosing a ring bound planner (A Bowl Full of Lemons)](https://www.abowlfulloflemons.net/2015/12/choosing-a-ring-bound-planner.html) |
| Disc planner Classic (7×9.25) | 7 × 9.25 in | 0.125 in | US | Unverified. [How to print printables at Happy Planner size (All About Planners)](https://allaboutplanners.com.au/print-printables-mambi-happy-planner-size/) |
| Traveler's-style insert Regular | 110 × 210 mm | 3 mm | Japan, International | Unverified. [Choosing a ring bound planner (A Bowl Full of Lemons)](https://www.abowlfulloflemons.net/2015/12/choosing-a-ring-bound-planner.html) |
| Traveler's-style insert Passport | 89 × 124 mm | 3 mm | Japan, International | [Traveler's Notebook Passport Refill 013 (Goulet Pens)](https://www.gouletpens.com/products/travelers-notebook-passport-refill-013-blank-cream-paper) |
| Calendar page A4 landscape | 297 × 210 mm | 3 mm | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Calendar page Letter landscape | 11 × 8.5 in | 0.125 in | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| File folder label (US) | 3.4375 × 0.6667 in |  | US, Canada | [Avery file folder labels 2/3 × 3-7/16 in (Avery help)](https://www.avery.com/help/article/avery-file-folder-labels-2-3-inch-x-3-and-7-16-inch-white) |
| Lever-arch spine label wide | 61 × 192 mm |  | Germany, EU | Unverified. [Leitz Rückenschilder 61 × 192 mm (Kaufland listing)](https://www.kaufland.at/product/12620471/) |
| Lever-arch spine label narrow | 39 × 192 mm |  | Germany, EU | Unverified. [Leitz Rückenschilder 61 × 192 mm (Kaufland listing)](https://www.kaufland.at/product/12620471/) |
| Document post / PDF carousel 4:5 | 1080 × 1350 px |  | Global | Unverified. [Instagram image sizes & video formats (IONOS Digital Guide)](https://www.ionos.com/digitalguide/online-marketing/social-media/instagram-images-sizes/), [Guide to LinkedIn PDF carousels (Metricool)](https://metricool.com/linkedin-pdf-carousels/) |
| Document post / PDF carousel 1:1 | 1080 × 1080 px |  | Global | Unverified. [Instagram image sizes & video formats (IONOS Digital Guide)](https://www.ionos.com/digitalguide/online-marketing/social-media/instagram-images-sizes/), [Guide to LinkedIn PDF carousels (Metricool)](https://metricool.com/linkedin-pdf-carousels/) |
| Document post 3:4 | 1080 × 1440 px |  | Global | Unverified. [Instagram image sizes & video formats (IONOS Digital Guide)](https://www.ionos.com/digitalguide/online-marketing/social-media/instagram-images-sizes/) |
| A4 on screen (96 ppi) | 794 × 1123 px |  | International | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |
| Letter on screen (96 ppi) | 816 × 1056 px |  | US, Canada | [Paper size (Wikipedia)](https://en.wikipedia.org/wiki/Paper_size) |

### Books and publishing

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| US Trade 6×9 | 6 × 9 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Digest 5.5×8.5 | 5.5 × 8.5 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| 5×8 | 5 × 8 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| 5.25×8 | 5.25 × 8 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Royal (US POD) 6.14×9.21 | 6.14 × 9.21 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| 7×10 | 7 × 10 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Letter 8.5×11 | 8.5 × 11 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Hardcover 8.25×11 | 8.25 × 11 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Mass market 4.25×6.87 | 4.25 × 6.87 in | 0.125 in | North America | [Lulu Blog, "Lulu's Book Product Type Options"](https://blog.lulu.com/lulus-book-product-type-options/) |
| A5 | 148 × 210 mm | 3 mm | International | [ISO 216:2007, "Writing paper and certain classes of printed matter, Trimmed sizes, A and B series"](https://www.iso.org/standard/36631.html), [Lulu Blog, "Lulu's Book Product Type Options"](https://blog.lulu.com/lulus-book-product-type-options/) |
| B5 | 176 × 250 mm | 3 mm | International | [ISO 216:2007, "Writing paper and certain classes of printed matter, Trimmed sizes, A and B series"](https://www.iso.org/standard/36631.html) |
| A-format | 111 × 178 mm | 3 mm | UK | Unverified. [Publishing.co.uk, "Standard book sizes UK"](https://publishing.co.uk/guides/standard-book-sizes-uk/) |
| B-format | 129 × 198 mm | 3 mm | UK | Unverified. [Publishing.co.uk, "Standard book sizes UK"](https://publishing.co.uk/guides/standard-book-sizes-uk/) |
| Demy | 138 × 216 mm | 3 mm | UK, Australia | [UCL Slade School, "Standard book sizes"](https://www.ucl.ac.uk/slade/know/3060), [Publishing.co.uk, "Standard book sizes UK"](https://publishing.co.uk/guides/standard-book-sizes-uk/) |
| Royal | 156 × 234 mm | 3 mm | UK, Australia | [UCL Slade School, "Standard book sizes"](https://www.ucl.ac.uk/slade/know/3060), [Publishing.co.uk, "Standard book sizes UK"](https://publishing.co.uk/guides/standard-book-sizes-uk/) |
| Bunko (A6) | 105 × 148 mm | 3 mm | Japan | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519) |
| Shinsho | 103 × 182 mm | 3 mm | Japan | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519) |
| Shiroku-ban | 127 × 188 mm | 3 mm | Japan | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519) |
| Sinkukpan | 152 × 225 mm | 3 mm | Korea | Unverified. [Happycampus, Korean book format reference](https://www.happycampus.com/knowhow-doc/29898991) |
| Picture book 8×10 | 8 × 10 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Picture book square 8.5×8.5 | 8.5 × 8.5 in | 0.125 in | International | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6), [Lulu Blog, "Lulu's Book Product Type Options"](https://blog.lulu.com/lulus-book-product-type-options/) |
| Square 8.25×8.25 | 8.25 × 8.25 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Picture book landscape 10×8 | 10 × 8 in | 0.125 in | North America | Unverified. [SVS Learn forum, landscape picture book trim discussion](https://forum.svslearn.com/post/114083) |
| Landscape 8.25×6 | 8.25 × 6 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Cookbook 7.5×9.25 | 7.5 × 9.25 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Ebook cover 1600×2560 | 1600 × 2560 px |  | International | [Amazon KDP Help, "eBook cover image guidelines"](https://kdp.amazon.com/en_US/help/topic/G200645690) |
| Ebook cover 1600×2400 | 1600 × 2400 px |  | International | Unverified. [Apple Books for Authors, "Publish your book"](https://itunespartner.apple.com/books/support/9-prepare-book) |
| Ebook cover 2500×3500 | 2500 × 3500 px |  | International | Unverified. [Cambric, "Kobo requirements"](https://cambric.pub/guides/kobo-requirements) |
| Magazine US 8.375×10.875 | 8.375 × 10.875 in | 0.125 in | North America | [UNLV Magazine, "Print advertising specifications"](https://unlv.edu/sites/default/files/media/document/2025-01/UNLV-Magazine-PrintAdvertising-Specifications.pdf) |
| Magazine 8.5×11 | 8.5 × 11 in | 0.125 in | North America | [Lulu Blog, "New Product Announcement: Comic Books and Magazines"](https://blog.lulu.com/new-product-announcement-comic-books-and-magazines/) |
| Magazine A4 | 210 × 297 mm | 3 mm | International | [ISO 216:2007, "Writing paper and certain classes of printed matter, Trimmed sizes, A and B series"](https://www.iso.org/standard/36631.html), [Lulu Blog, "New Product Announcement: Comic Books and Magazines"](https://blog.lulu.com/new-product-announcement-comic-books-and-magazines/) |
| Zine A5 | 148 × 210 mm | 3 mm | International | [ISO 216:2007, "Writing paper and certain classes of printed matter, Trimmed sizes, A and B series"](https://www.iso.org/standard/36631.html) |
| Zine half-letter | 5.5 × 8.5 in | 0.125 in | North America | [Amazon KDP Help, "Trim size, bleed, and margins"](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6) |
| Comic US 6.625×10.25 | 6.625 × 10.25 in | 0.125 in | North America | [Lulu Blog, "New Product Announcement: Comic Books and Magazines"](https://blog.lulu.com/new-product-announcement-comic-books-and-magazines/) |
| Manga tankobon B6 | 128 × 182 mm | 3 mm | Japan | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519), [JIS paper size reference table](https://www.asahi-net.or.jp/~AX2S-KMTN/ref/paper_size.html) |
| Manga small B6 | 112 × 174 mm | 3 mm | Japan | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519) |
| Manga A5 | 148 × 210 mm | 3 mm | Japan, International | [Booklog, "Book size column"](https://booklog.jp/hon/column/book-size-20170519) |
| Album cover 3000×3000 | 3000 × 3000 px |  | International | [Apple Music for Partners, "Digital packaging"](https://itunespartner.apple.com/music/support/5215-digital-packaging-music) |
| Album cover 4000×4000 | 4000 × 4000 px |  | International | Unverified. [RouteNote, "Music artwork sizes for Spotify, Apple Music, YouTube and social platforms"](https://routenote.com/radar/music-artwork-sizes-for-spotify-apple-music-youtube-and-social-platforms/) |
| Podcast cover 3000×3000 | 3000 × 3000 px |  | International | [Apple Podcasts for Creators, "Show Cover template"](https://podcasters.apple.com/support/5514-show-cover-template) |
| Audiobook cover 2400×2400 | 2400 × 2400 px |  | International | [ACX Help, "Cover art requirements"](https://help.acx.com/s/article/cover-art-requirements) |

### Video and screens

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| Full HD 1080p | 1920 × 1080 px |  | International | [ITU-R BT.709, Parameter values for the HDTV standards](https://www.itu.int/rec/R-REC-BT.709), [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| 4K UHD 2160p | 3840 × 2160 px |  | International | [ITU-R BT.2020, Parameter values for UHDTV systems](https://www.itu.int/rec/R-REC-BT.2020), [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| HD 720p | 1280 × 720 px |  | International | [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| QHD 1440p | 2560 × 1440 px |  | International | [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| 8K UHD 4320p | 7680 × 4320 px |  | International | [ITU-R BT.2020, Parameter values for UHDTV systems](https://www.itu.int/rec/R-REC-BT.2020), [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| SD 480 (525-line) | 720 × 480 px |  | North America, Japan, Korea, parts of Latin America | [ITU-R BT.601 (summary: Rec. 601)](https://www.itu.int/rec/R-REC-BT.601) |
| SD 576 (625-line) | 720 × 576 px |  | Europe, Australia, India, most of Latin America | [ITU-R BT.601 (summary: Rec. 601)](https://www.itu.int/rec/R-REC-BT.601) |
| SD 480p (web, square pixels) | 854 × 480 px |  | International | [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| DCI 4K (full container) | 4096 × 2160 px |  | International (cinema) | [4K resolution (DCI specification, SMPTE 428-1 picture sizes)](https://en.wikipedia.org/wiki/4K_resolution) |
| DCI 2K (full container) | 2048 × 1080 px |  | International (cinema) | [4K resolution (DCI specification, SMPTE 428-1 picture sizes)](https://en.wikipedia.org/wiki/4K_resolution) |
| Cinema flat 1.85:1 (4K) | 3996 × 2160 px |  | International (cinema) | [4K resolution (DCI specification, SMPTE 428-1 picture sizes)](https://en.wikipedia.org/wiki/4K_resolution) |
| Cinema scope 2.39:1 (4K) | 4096 × 1716 px |  | International (cinema) | [4K resolution (DCI specification, SMPTE 428-1 picture sizes)](https://en.wikipedia.org/wiki/4K_resolution) |
| Cinema flat 1.85:1 (2K) | 1998 × 1080 px |  | International (cinema) | Unverified. [Cinepedia: Resolution and aspect ratio](https://cinepedia.com/picture/resolution-and-aspect-ratio/) |
| Cinema scope 2.39:1 (2K) | 2048 × 858 px |  | International (cinema) | Unverified. [Cinepedia: Resolution and aspect ratio](https://cinepedia.com/picture/resolution-and-aspect-ratio/) |
| Vertical video 1080×1920 | 1080 × 1920 px |  | International | [ITU-R BT.2020, Parameter values for UHDTV systems](https://www.itu.int/rec/R-REC-BT.2020) |
| Vertical video 4K | 2160 × 3840 px |  | International | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431) |
| Square video 1080×1080 | 1080 × 1080 px |  | International | Unverified. common practice, no official page |
| Portrait 4:5 1080×1350 | 1080 × 1350 px |  | International | Unverified. common practice, no official page |
| Video thumbnail 1280×720 | 1280 × 720 px |  | International | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431) |
| Video thumbnail 4K | 3840 × 2160 px |  | International | [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431) |
| Video end card / end screen | 1920 × 1080 px |  | International | [YouTube Help: Video resolution and aspect ratios](https://support.google.com/youtube/answer/6375112) |
| Live-stream overlay 1080p | 1920 × 1080 px |  | International | Unverified. [Twitch Help: Broadcasting guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines), [EventLive Help: Optimal video settings in OBS Studio](https://help.eventlive.pro/en/articles/11592143-how-to-set-optimal-video-settings-in-obs-studio) |
| Live-stream overlay 720p | 1280 × 720 px |  | International | Unverified. [Twitch Help: Broadcasting guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines), [EventLive Help: Optimal video settings in OBS Studio](https://help.eventlive.pro/en/articles/11592143-how-to-set-optimal-video-settings-in-obs-studio) |
| Desktop 1920×1080 | 1920 × 1080 px |  | International | [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Desktop 2560×1440 | 2560 × 1440 px |  | International | [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Desktop 3840×2160 | 3840 × 2160 px |  | International | [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Desktop 1920×1200 | 1920 × 1200 px |  | International | Unverified. [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Desktop 2560×1600 | 2560 × 1600 px |  | International | Unverified. [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Desktop 1366×768 | 1366 × 768 px |  | International | [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Ultrawide 3440×1440 | 3440 × 1440 px |  | International | [B&H: Dell UltraSharp 34 U3425WE (3440×1440) specs](https://www.bhphotovideo.com/c/product/1817112-REG/dell_u3425we_ultrasharp_34_1440p_120.html) |
| Ultrawide 2560×1080 | 2560 × 1080 px |  | International | Unverified. [Statcounter: Desktop screen resolution stats worldwide](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide/) |
| Super ultrawide 5120×1440 | 5120 × 1440 px |  | International | Unverified. [SHI Direct: curved monitors listing (Dell U4924DW 5120×1440)](https://www.shidirect.com/shop/search/hardware/monitors-and-projectors/monitors-and-displays?k=curved) |
| 5K 5120×2880 | 5120 × 2880 px |  | International | [Apple: Studio Display tech specs](https://www.apple.com/studio-display/specs/) |
| iMac 24-inch | 4480 × 2520 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| MacBook Neo 13-inch | 2408 × 1506 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| MacBook Air 13-inch | 2560 × 1664 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| MacBook Air 15-inch | 2880 × 1864 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| MacBook Pro 14-inch | 3024 × 1964 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| MacBook Pro 16-inch | 3456 × 2234 px |  | International | [Apple: Compare Mac models](https://www.apple.com/mac/compare/) |
| iPhone 18 Pro Max | 1320 × 2868 px |  | International | [Apple: iPhone 18 Pro tech specs](https://www.apple.com/iphone-18-pro/specs/) |
| iPhone 18 Pro / iPhone 17 | 1206 × 2622 px |  | International | [Apple: iPhone 18 Pro tech specs](https://www.apple.com/iphone-18-pro/specs/), [Apple: iPhone 17 tech specs](https://www.apple.com/iphone-17/specs/) |
| iPhone Air | 1260 × 2736 px |  | International | [Apple: iPhone Air tech specs](https://www.apple.com/iphone-air/specs/) |
| Pixel 11 Pro XL | 1344 × 2992 px |  | International | [Google Store: Pixel 11 Pro and 11 Pro XL tech specs](https://store.google.com/product/pixel_11_pro_specs) |
| Pixel 11 Pro | 1280 × 2856 px |  | International | [Google Store: Pixel 11 Pro and 11 Pro XL tech specs](https://store.google.com/product/pixel_11_pro_specs) |
| Pixel 11 | 1080 × 2424 px |  | International | [Google Store: Pixel 11 tech specs](https://store.google.com/product/pixel_11_specs) |
| Galaxy S26 Ultra / S26+ | 1440 × 3120 px |  | International | Unverified. [OLED-Info: Samsung Galaxy S26 / S26+ / S26 Ultra](https://www.oled-info.com/samsung-galaxy-s26-s26-s26-ultra) |
| Galaxy S26 | 1080 × 2340 px |  | International | Unverified. [OLED-Info: Samsung Galaxy S26 / S26+ / S26 Ultra](https://www.oled-info.com/samsung-galaxy-s26-s26-s26-ultra) |
| iPad Pro 13-inch | 2064 × 2752 px |  | International | [Apple: Compare iPad models](https://www.apple.com/ipad/compare/) |
| iPad Pro 11-inch | 1668 × 2420 px |  | International | [Apple: Compare iPad models](https://www.apple.com/ipad/compare/) |
| iPad Air 13-inch | 2048 × 2732 px |  | International | [Apple: Compare iPad models](https://www.apple.com/ipad/compare/) |
| iPad Air 11-inch / iPad | 1640 × 2360 px |  | International | [Apple: Compare iPad models](https://www.apple.com/ipad/compare/) |
| iPad mini | 1488 × 2266 px |  | International | [Apple: Compare iPad models](https://www.apple.com/ipad/compare/) |
| Galaxy Tab S11 Ultra | 1848 × 2960 px |  | International | Unverified. [GSMArena: Samsung Galaxy Tab S11 Ultra review](https://m.gsmarena.com/samsung_galaxy_tab_s11_ultra-review-2890.php) |
| Galaxy Tab S11 | 1600 × 2560 px |  | International | Unverified. [GSMArena: Samsung Galaxy Tab S11 Ultra review](https://m.gsmarena.com/samsung_galaxy_tab_s11_ultra-review-2890.php) |
| Apple Watch Ultra 4 (49 mm) | 422 × 514 px |  | International | [Apple: Apple Watch Ultra 4 tech specs](https://www.apple.com/apple-watch-ultra-4/specs/) |
| Apple Watch Series 12 46 mm | 416 × 496 px |  | International | [Apple: Apple Watch Series 12 tech specs](https://www.apple.com/apple-watch-series-12/specs/) |
| Apple Watch Series 12 42 mm | 374 × 446 px |  | International | [Apple: Apple Watch Series 12 tech specs](https://www.apple.com/apple-watch-series-12/specs/) |
| Apple Watch SE 3 44 mm | 368 × 448 px |  | International | [Apple: Apple Watch SE 3 tech specs](https://www.apple.com/apple-watch-se-3/specs/) |
| Apple Watch SE 3 40 mm | 324 × 394 px |  | International | [Apple: Apple Watch SE 3 tech specs](https://www.apple.com/apple-watch-se-3/specs/) |
| Round watch face 480×480 | 480 × 480 px |  | International | Unverified. [GSMArena: Samsung Galaxy Watch8](https://m.gsmarena.com/samsung_galaxy_watch8-ampp-13997.php) |
| Round watch face 438×438 | 438 × 438 px |  | International | Unverified. [GSMArena: Samsung Galaxy Watch8](https://m.gsmarena.com/samsung_galaxy_watch8-ampp-13997.php) |
| Signage 1080p landscape | 1920 × 1080 px |  | International | Unverified. [Signage Help Center: Optimal video and audio dimensions for displays](https://signage.help.center/article/1015-optimal-video-and-audio-dimensions-for-displays) |
| Signage 1080p portrait | 1080 × 1920 px |  | International | Unverified. [Signage Help Center: Optimal video and audio dimensions for displays](https://signage.help.center/article/1015-optimal-video-and-audio-dimensions-for-displays), [Samsung Business: 4K UHD signage](https://www.samsung.com/uk/business/smart-signage/4k-signage/) |
| Signage 4K landscape | 3840 × 2160 px |  | International | Unverified. [Signage Help Center: Optimal video and audio dimensions for displays](https://signage.help.center/article/1015-optimal-video-and-audio-dimensions-for-displays) |
| Signage 4K portrait | 2160 × 3840 px |  | International | Unverified. [Signage Help Center: Optimal video and audio dimensions for displays](https://signage.help.center/article/1015-optimal-video-and-audio-dimensions-for-displays) |

### App and web design

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| iPhone 17 / 17 Pro / 18 Pro | 402 × 874 px |  | International | [Apple, iPhone 17 Pro and 17 Pro Max – Technical Specifications](https://www.apple.com/iphone-17-pro/specs/), [Use Your Loaf, iPhone 17 Screen Sizes](https://useyourloaf.com/blog/iphone-17-screen-sizes/), [Apple Support, iPhone 18 Pro – Tech Specs](https://support.apple.com/en-us/148590), [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout) |
| iPhone 17 Pro Max / 18 Pro Max | 440 × 956 px |  | International | [Apple, iPhone 17 Pro and 17 Pro Max – Technical Specifications](https://www.apple.com/iphone-17-pro/specs/), [Use Your Loaf, iPhone 17 Screen Sizes](https://useyourloaf.com/blog/iphone-17-screen-sizes/), [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout) |
| iPhone Air | 420 × 912 px |  | International | [Use Your Loaf, iPhone 17 Screen Sizes](https://useyourloaf.com/blog/iphone-17-screen-sizes/), [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout) |
| iPhone 15 / 16 | 393 × 852 px |  | International | [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts), [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design) |
| iPhone 15 / 16 Plus | 430 × 932 px |  | International | [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPhone 13 / 14 / 16e | 390 × 844 px |  | International | [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPhone 14 Plus / 13 Pro Max | 428 × 926 px |  | International | [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPhone X class | 375 × 812 px |  | International | Unverified. [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout), [react-figma, Frame presets list](https://react-figma.dev/docs/api/frame) |
| iPhone 11 / XR | 414 × 896 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts), [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide) |
| iPhone SE | 375 × 667 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPhone Duo (folded) | 466 × 678 px |  | International | Unverified. [AppleInsider, iPhone 18 Pro vs iPhone Duo compared](https://appleinsider.com/inside/iphone-18/vs/iphone-18-pro-vs-iphone-duo-apples-new-models-compared) |
| iPhone Duo (unfolded) | 626 × 890 px |  | International | Unverified. [AppleInsider, iPhone 18 Pro vs iPhone Duo compared](https://appleinsider.com/inside/iphone-18/vs/iphone-18-pro-vs-iphone-duo-apples-new-models-compared) |
| Android phone 360×800 | 360 × 800 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts), [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide) |
| Galaxy S (base) 360×780 | 360 × 780 px |  | International | Unverified. [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide), [YesViz, Samsung Galaxy S25 Ultra viewport size](https://yesviz.com/devices/samsung-s25-ultra) |
| Android phone 384×832 | 384 × 832 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide) |
| Pixel 7 / 8 class | 412 × 915 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Pixel 9 / 10 | 412 × 924 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Galaxy S Ultra | 412 × 891 px |  | International | Unverified. [YesViz, Samsung Galaxy S25 Ultra viewport size](https://yesviz.com/devices/samsung-s25-ultra) |
| Pixel Pro XL | 448 × 997 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Android reference phone | 411 × 891 px |  | International | [Android Developers, PreviewScreenSizes (reference device sizes)](https://developer.android.com/reference/kotlin/androidx/compose/ui/tooling/preview/PreviewScreenSizes) |
| Android Compact (Figma) | 412 × 917 px |  | International | Unverified. [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design) |
| Android small 360×640 | 360 × 640 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Foldable, unfolded | 673 × 841 px |  | International | [Android Developers, PreviewScreenSizes (reference device sizes)](https://developer.android.com/reference/kotlin/androidx/compose/ui/tooling/preview/PreviewScreenSizes) |
| Galaxy Z Fold cover screen | 412 × 968 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPad mini 8.3 | 744 × 1133 px |  | International | [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/), [Apple, Human Interface Guidelines – Layout (change log of device specifications)](https://developer.apple.com/design/human-interface-guidelines/layout) |
| iPad / iPad Air 11 | 820 × 1180 px |  | International | [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPad Pro 11 (M4 and later) | 834 × 1210 px |  | International | [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/) |
| iPad Pro 11 (2018–2022) | 834 × 1194 px |  | International | [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design), [react-figma, Frame presets list](https://react-figma.dev/docs/api/frame) |
| iPad Air 13 / iPad Pro 12.9 | 1024 × 1366 px |  | International | [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/), [react-figma, Frame presets list](https://react-figma.dev/docs/api/frame) |
| iPad Pro 13 (M4 and later) | 1032 × 1376 px |  | International | [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| iPad 10.2 | 810 × 1080 px |  | International | Unverified. [Apple, iPad – Compare Models](https://www.apple.com/ipad/compare/) |
| iPad 9.7 / mini (classic) | 768 × 1024 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Android tablet | 800 × 1280 px |  | International | [Android Developers, PreviewScreenSizes (reference device sizes)](https://developer.android.com/reference/kotlin/androidx/compose/ui/tooling/preview/PreviewScreenSizes) |
| Android Medium (Figma) | 700 × 840 px |  | International | Unverified. [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design), [Material Design 3, Breakpoints](https://m3.material.io/foundations/layout/breakpoints) |
| Surface Pro | 1440 × 960 px |  | International | [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Apple Watch 40 mm | 162 × 197 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch tech specs (Series 9, SE, Ultra 2)](https://support.apple.com/specs/applewatch) |
| Apple Watch 41 mm | 176 × 215 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch tech specs (Series 9, SE, Ultra 2)](https://support.apple.com/specs/applewatch) |
| Apple Watch 42 mm (Series 10/11) | 187 × 223 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch Series 10 – Tech Specs](https://support.apple.com/en-us/121202) |
| Apple Watch 44 mm | 184 × 224 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch tech specs (Series 9, SE, Ultra 2)](https://support.apple.com/specs/applewatch) |
| Apple Watch 45 mm | 198 × 242 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch tech specs (Series 9, SE, Ultra 2)](https://support.apple.com/specs/applewatch) |
| Apple Watch 46 mm (Series 10/11) | 208 × 248 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch Series 10 – Tech Specs](https://support.apple.com/en-us/121202) |
| Apple Watch Ultra / Ultra 2 | 205 × 251 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple Support, Apple Watch tech specs (Series 9, SE, Ultra 2)](https://support.apple.com/specs/applewatch) |
| Apple Watch Ultra 3 / 4 | 211 × 257 px |  | International | [Apple Developer, Supporting multiple watch sizes](https://developer.apple.com/documentation/watchos-apps/supporting-multiple-watch-sizes), [Apple, Apple Watch Ultra 4 – Technical Specifications](https://www.apple.com/apple-watch-ultra-4/specs/) |
| Wear OS small round | 192 × 192 px |  | International | [Android Developers, Wear OS – Screen sizes](https://developer.android.com/design/ui/wear/guides/m2-5/foundations/screen-sizes) |
| Wear OS large round | 227 × 227 px |  | International | Unverified. [Android Developers, Wear OS – Screen sizes](https://developer.android.com/design/ui/wear/guides/m2-5/foundations/screen-sizes) |
| Web mobile 360 | 360 × 800 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide), [Material Design 3, Breakpoints](https://m3.material.io/foundations/layout/breakpoints) |
| Web tablet 768 | 768 × 1024 px |  | International | [Tailwind CSS, Responsive design](https://tailwindcss.com/docs/responsive-design), [Bootstrap, Breakpoints (v5.3 and v6.0)](https://getbootstrap.com/docs/6.0/layout/breakpoints/), [Chrome for Developers, Simulate mobile devices with device mode (width presets)](https://developer.chrome.com/docs/devtools/device-mode) |
| Web small desktop 1024 | 1024 × 768 px |  | International | [Tailwind CSS, Responsive design](https://tailwindcss.com/docs/responsive-design), [Bootstrap, Breakpoints (v5.3 and v6.0)](https://getbootstrap.com/docs/6.0/layout/breakpoints/), [Chrome for Developers, Simulate mobile devices with device mode (width presets)](https://developer.chrome.com/docs/devtools/device-mode) |
| Web laptop 1280 | 1280 × 800 px |  | International | [Tailwind CSS, Responsive design](https://tailwindcss.com/docs/responsive-design), [Bootstrap, Breakpoints (v5.3 and v6.0)](https://getbootstrap.com/docs/6.0/layout/breakpoints/), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Web desktop 1440 | 1440 × 900 px |  | International | [Chrome for Developers, Simulate mobile devices with device mode (width presets)](https://developer.chrome.com/docs/devtools/device-mode), [Chrome DevTools, EmulatedDevices.ts (built-in device list)](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts) |
| Web Full HD 1920 | 1920 × 1080 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide), [Android Developers, PreviewScreenSizes (reference device sizes)](https://developer.android.com/reference/kotlin/androidx/compose/ui/tooling/preview/PreviewScreenSizes) |
| Laptop 1366×768 | 1366 × 768 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide) |
| Laptop 1536×864 | 1536 × 864 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide), [Tailwind CSS, Responsive design](https://tailwindcss.com/docs/responsive-design) |
| MacBook Air 13 | 1470 × 956 px |  | International | Unverified. [Apple, MacBook Air 13- and 15-inch – Tech Specs](https://www.apple.com/macbook-air/specs/), [Hacker News discussion of MacBook Air default scaling (1470×956)](https://news.ycombinator.com/item?id=47572070) |
| MacBook Air 13 (2×) | 1280 × 832 px |  | International | Unverified. [Apple, MacBook Air 13- and 15-inch – Tech Specs](https://www.apple.com/macbook-air/specs/), [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design) |
| MacBook Pro 14 | 1512 × 982 px |  | International | Unverified. [Apple, MacBook Pro – Tech Specs](https://www.apple.com/macbook-pro/specs/) |
| MacBook Pro 16 | 1728 × 1117 px |  | International | Unverified. [Apple, MacBook Pro – Tech Specs](https://www.apple.com/macbook-pro/specs/) |
| Desktop 1440×1024 | 1440 × 1024 px |  | International | Unverified. [Figma Help Center, Frames in Figma Design (frame presets)](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design), [ImageResizers, Figma image sizes and frame presets](https://www.imageresizers.net/figma-image-sizes) |
| Desktop QHD 2560×1440 | 2560 × 1440 px |  | International | [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide) |
| Desktop 1280×720 | 1280 × 720 px |  | International | Unverified. [Statcounter Global Stats, Screen Resolution Stats Worldwide (desktop and mobile, September 2026)](https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide), [Apple Developer, Positioning and sizing windows (visionOS)](https://developer.apple.com/documentation/visionos/positioning-and-sizing-windows) |
| Email (600 wide) | 600 × 800 px |  | International | [Mailchimp, About HTML Email](https://mailchimp.com/help/about-html-email/), [Litmus, 7 Myths of Email Development](https://www.litmus.com/blog/7-myths-of-email-development) |
| Apple TV (tvOS) | 1920 × 1080 px |  | International | [Apple, Human Interface Guidelines – Layout (tvOS safe area)](https://developer.apple.com/design/human-interface-guidelines/layout) |
| Android TV / Google TV | 960 × 540 px |  | International | [Android Developers, TV – Layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts) |

### Merch and products

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| T-shirt front, large DTG | 15 × 18 in |  | International (US units) | [Printful, Unisex Staple T-Shirt (Bella + Canvas 3001), File guidelines tab](https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001#guidelines), [Printful Help Center, What should I know about the standard 15″ × 18″ print placement for DTG products?](https://help.printful.com/hc/en-us/articles/50263171283217) |
| T-shirt front/back, standard | 12 × 16 in |  | International (US units) | [Printful, Unisex Staple T-Shirt (Bella + Canvas 3001), File guidelines tab](https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001#guidelines), [Printful Blog, How to prepare perfect print files for print-on-demand](https://www.printful.com/blog/everything-you-need-to-know-to-prepare-the-perfect-printfile), [Printful, Unisex Heavy Blend Hoodie (Gildan 18500), File guidelines tab](https://www.printful.com/custom/mens/hoodies/unisex-heavy-blend-hoodie-gildan-18500#guidelines) |
| T-shirt front, XS–M | 11.5 × 13.8 in |  | International (US units) | [Printful, Unisex Staple T-Shirt (Bella + Canvas 3001), File guidelines tab](https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001#guidelines), [Printful Help Center, How is my design scaled for different garment sizes?](https://help.printful.com/hc/en-us/articles/50264397552657) |
| Left chest | 4 × 4 in |  | International (US units) | [Printful Blog, T-shirt design placement guide](https://www.printful.com/blog/t-shirt-design-placement-guide), [Gelato Blog, T-shirt design placement guide](https://gelato.com/blog/t-shirt-design-placement-guide) |
| Center chest | 8 × 8 in |  | International (US units) | [Printful Blog, T-shirt design placement guide](https://www.printful.com/blog/t-shirt-design-placement-guide), [Gelato Blog, T-shirt design placement guide](https://gelato.com/blog/t-shirt-design-placement-guide) |
| Upper back | 12 × 5 in |  | International (US units) | [Gelato Blog, T-shirt design placement guide](https://gelato.com/blog/t-shirt-design-placement-guide) |
| Short sleeve | 4 × 3.5 in |  | International (US units) | [Printful, Unisex Staple T-Shirt (Bella + Canvas 3001), File guidelines tab](https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001#guidelines), [Printful Blog, Create the perfect t-shirt sleeve design](https://www.printful.com/blog/t-shirt-sleeve-design) |
| Long sleeve, full length | 3 × 12 in |  | International (US units) | [Printful, Unisex Heavy Blend Hoodie (Gildan 18500), File guidelines tab](https://www.printful.com/custom/mens/hoodies/unisex-heavy-blend-hoodie-gildan-18500#guidelines), [Printful Blog, Create the perfect t-shirt sleeve design](https://www.printful.com/blog/t-shirt-sleeve-design) |
| Inside/outside neck label | 3 × 3 in |  | International (US units) | [Printful, Unisex Staple T-Shirt (Bella + Canvas 3001), File guidelines tab](https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001#guidelines) |
| Hoodie front | 14 × 14 in |  | International (US units) | [Printful, Unisex Heavy Blend Hoodie (Gildan 18500), File guidelines tab](https://www.printful.com/custom/mens/hoodies/unisex-heavy-blend-hoodie-gildan-18500#guidelines) |
| T-shirt (Redbubble men's graphic) | 3873 × 4814 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Tote bag, printed | 9.5 × 9.5 in |  | International (US units) | [Printful, Eco Tote Bag (Econscious EC8000), File guidelines tab](https://www.printful.com/custom/bags/totes/eco-tote-bag-econscious-ec8000#guidelines) |
| Tote bag, all-over print | 17 × 33 in |  | International (US units) | [Printful, All-Over Print Tote Bag, File guidelines tab](https://www.printful.com/custom/bags/totes/all-over-print-tote#guidelines) |
| Tote bag (Redbubble cotton) | 2400 × 3200 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Mug wrap, 11 oz | 9 × 3.5 in |  | International (US units) | [Printful, White Glossy Mug, File guidelines tab](https://www.printful.com/custom/home-living/all/white-glossy-mug#guidelines) |
| Mug wrap, 15 oz | 9 × 3.8 in |  | International (US units) | [Printful, White Glossy Mug, File guidelines tab](https://www.printful.com/custom/home-living/all/white-glossy-mug#guidelines) |
| Mug wrap, 20 oz | 10.23 × 4.01 in |  | International (US units) | [Printful, White Glossy Mug, File guidelines tab](https://www.printful.com/custom/home-living/all/white-glossy-mug#guidelines) |
| Mug wrap, 11 oz (Gelato) | 200 × 96 mm |  | Europe / International | [Gelato Help Center, What is the printable area for mugs?](https://support.gelato.com/en/articles/8996273-what-is-the-printable-area-for-mugs) |
| Mug wrap, 15 oz (Gelato) | 213 × 103 mm |  | Europe / International | [Gelato Help Center, What is the printable area for mugs?](https://support.gelato.com/en/articles/8996273-what-is-the-printable-area-for-mugs) |
| Mug (Redbubble standard) | 2700 × 1120 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Water bottle, 17 oz | 8.52 × 5.27 in |  | International (US units) | [Printful, Stainless Steel Water Bottle, File guidelines tab](https://www.printful.com/custom/home-living/all/stainless-steel-water-bottle#guidelines) |
| Water bottle, 17 oz (Gelato) | 87 × 110 mm |  | Europe / International | [Gelato Help Center, What is the printable area for mugs?](https://support.gelato.com/en/articles/8996273-what-is-the-printable-area-for-mugs) |
| Phone case (iPhone, one template) | 4.64 × 7.4 in |  | International (US units) | [Printful, Tough Case for iPhone, File guidelines tab](https://www.printful.com/custom/phone-cases/personalized/tough-iphone-case#guidelines) |
| Phone case (Redbubble) | 1187 × 1852 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Poster 8×10 | 8 × 10 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines) |
| Poster 11×14 | 11 × 14 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines) |
| Poster 12×16 | 12 × 16 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines) |
| Poster 12×18 | 12 × 18 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines) |
| Poster 16×20 | 16 × 20 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines) |
| Poster 18×24 | 18 × 24 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines), [Printful, Custom posters (FAQ: sizes)](https://www.printful.com/custom-posters) |
| Poster 24×36 | 24 × 36 in |  | North America | [Printful, Enhanced Matte Paper Poster (in), sizes and File guidelines tab](https://www.printful.com/custom/home-living/all/enhanced-matte-paper-poster-in#guidelines), [Printful, Custom posters (FAQ: sizes)](https://www.printful.com/custom-posters) |
| Poster 21×30 cm | 210 × 300 mm | 4 mm | Europe | [Printful, Custom posters (FAQ: sizes)](https://www.printful.com/custom-posters), [Gelato Help Center, What product formats and dimensions do you support?](https://support.gelato.com/en/articles/8996362-what-product-formats-and-dimensions-do-you-support) |
| Poster 30×40 cm | 300 × 400 mm | 4 mm | Europe | [Gelato Help Center, What product formats and dimensions do you support?](https://support.gelato.com/en/articles/8996362-what-product-formats-and-dimensions-do-you-support) |
| Poster 70×100 cm | 700 × 1000 mm | 4 mm | Europe | [Printful, Custom posters (FAQ: sizes)](https://www.printful.com/custom-posters), [Gelato Help Center, What product formats and dimensions do you support?](https://support.gelato.com/en/articles/8996362-what-product-formats-and-dimensions-do-you-support) |
| Canvas 16×20 | 16 × 20 in | 1.5 in | North America | [Printful, Canvas (in), File guidelines tab](https://www.printful.com/custom/wall-art/canvas-prints/canvas-in#guidelines) |
| Throw pillow 18×18 | 18 × 18 in | 0.5 in | North America | [Printful, All-Over Print Basic Pillow, File guidelines tab](https://www.printful.com/custom/pillows/decorative/basic-pillow#guidelines) |
| Throw pillow 22×22 | 22 × 22 in | 0.5 in | North America | [Printful, All-Over Print Basic Pillow, File guidelines tab](https://www.printful.com/custom/pillows/decorative/basic-pillow#guidelines) |
| Lumbar pillow 20×12 | 20 × 12 in | 0.5 in | North America | [Printful, All-Over Print Basic Pillow, File guidelines tab](https://www.printful.com/custom/pillows/decorative/basic-pillow#guidelines) |
| Throw pillow (Redbubble) | 3225 × 3225 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Sticker sheet (A5) | 5.83 × 8.27 in | 0.12 in | International | [Printful, Kiss-Cut Sticker Sheet, File guidelines tab](https://www.printful.com/custom/home-living/all/kiss-cut-sticker-sheet#guidelines) |
| Sticker, extra large (Redbubble) | 2800 × 2800 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Hat front embroidery, low-profile | 5.5 × 2 in |  | International (US units) | [Printful, Classic Dad Hat (Yupoong 6245CM), File guidelines tab](https://www.printful.com/custom/hats/dad-hats/classic-dad-cap-yupoong-6245cm#guidelines), [Printful Help Center, Does the new, larger embroidery area of the hat front panel change anything for me?](https://help.printful.com/hc/en-us/articles/10345468617756) |
| Hat front embroidery, high-profile | 6.3 × 2.56 in |  | International (US units) | [Printful Help Center, Does the new, larger embroidery area of the hat front panel change anything for me?](https://help.printful.com/hc/en-us/articles/10345468617756) |
| Hat side/back embroidery | 2 × 1 in |  | International (US units) | [Printful, Classic Dad Hat (Yupoong 6245CM), File guidelines tab](https://www.printful.com/custom/hats/dad-hats/classic-dad-cap-yupoong-6245cm#guidelines) |
| Baseball cap / dad hat (Redbubble) | 2400 × 1140 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Socks, one side | 4.66 × 8 in |  | International (US units) | [Printful, Black Foot Sublimated Socks, File guidelines tab](https://www.printful.com/custom/socks/personalized/black-foot-sublimated-socks#guidelines) |
| Socks, full wrap | 18.64 × 8 in |  | International (US units) | [Printful, Black Foot Sublimated Socks, File guidelines tab](https://www.printful.com/custom/socks/personalized/black-foot-sublimated-socks#guidelines) |
| Socks (Redbubble) | 6300 × 5848 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |
| Apron, embroidered | 4 × 4 in |  | International (US units) | [Printful, Embroidered Apron (Liberty Bags 5502), File guidelines tab](https://www.printful.com/custom/home-living/all/embroidered-apron-liberty-bags-5502#guidelines) |
| Apron, printed (Redbubble) | 4065 × 4950 px |  | International | [Redbubble Help, Dimensions & Format (updated 2026-10-08)](https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format) |

### Logos and icons

| Size | W × H | Bleed | Region | Source |
|---|---|---|---|---|
| Logo, square (default) | 512 × 512 px |  | International | [Google Play icon design specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [web.dev, Adaptive icon support in PWAs with maskable icons](https://web.dev/articles/maskable-icon), [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| Logo / app icon master, large | 1024 × 1024 px |  | International | [Apple Human Interface Guidelines, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| Ad logo, square | 1200 × 1200 px |  | International | [Google Ads Help, About asset groups (logo specs)](https://support.google.com/google-ads/answer/10724748) |
| Ad logo, landscape | 1200 × 300 px |  | International | [Google Ads Help, About asset groups (logo specs)](https://support.google.com/google-ads/answer/10724748) |
| Horizontal logo / wordmark | 1200 × 600 px |  | International | Unverified. [Shopify blog, Logo size guide (third-party)](https://www.shopify.com/blog/logo-size) |
| iOS / iPadOS app icon | 1024 × 1024 px |  | International | [Apple Human Interface Guidelines, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| macOS app icon | 1024 × 1024 px |  | International | Unverified. [Apple Human Interface Guidelines, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons), [Apple Developer Forums, Specs for app icon for macOS app](https://developer.apple.com/forums/thread/670578) |
| watchOS app icon | 1088 × 1088 px |  | International | [Apple Human Interface Guidelines, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| tvOS app icon | 800 × 480 px |  | International | [Apple Human Interface Guidelines, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| Android adaptive icon layer | 432 × 432 px |  | International | [Android Developers, Adaptive icons](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive) |
| Google Play store icon | 512 × 512 px |  | International | [Google Play icon design specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications) |
| PWA icon, maskable | 512 × 512 px |  | International | [web.dev, Adaptive icon support in PWAs with maskable icons](https://web.dev/articles/maskable-icon), [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| PWA icon, small | 192 × 192 px |  | International | [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| Apple touch icon | 180 × 180 px |  | International | [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| Favicon master | 512 × 512 px |  | International | [Google Search Central, Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search), [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| Favicon, search results | 48 × 48 px |  | International | [Google Search Central, Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search) |
| favicon.ico | 32 × 32 px |  | International | [Evil Martians, How to Favicon: six files that fit most needs](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) |
| Windows app icon (ICO / target size) | 256 × 256 px |  | International | [Microsoft Learn, Construct your Windows app's icon](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction) |
| Windows medium tile | 150 × 150 px |  | International | [Microsoft Learn, Construct your Windows app's icon](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction) |
| Windows large tile | 310 × 310 px |  | International | [Microsoft Learn, Construct your Windows app's icon](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction) |
| Windows wide tile | 310 × 150 px |  | International | [Microsoft Learn, Construct your Windows app's icon](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction) |
| Sticker (messengers) | 512 × 512 px |  | International | [WhatsApp stickers repository, Android README](https://github.com/WhatsApp/stickers/blob/main/Android/README.md), [Telegram, Stickers and custom emoji](https://core.telegram.org/stickers) |
| Sticker pack tray icon | 96 × 96 px |  | International | [WhatsApp stickers repository, Android README](https://github.com/WhatsApp/stickers/blob/main/Android/README.md) |
| Custom emoji (chat apps) | 128 × 128 px |  | International | Unverified. [MakeEmoji, Discord emoji sizes guide (third-party)](https://makeemoji.com/blog/discord-emoji-sizes), [Slack Help, Add custom emoji and aliases](https://slack.com/help/articles/206870177) |
| Custom emoji (messenger) | 100 × 100 px |  | International | [Telegram, Stickers and custom emoji](https://core.telegram.org/stickers) |
| Streaming emote | 112 × 112 px |  | International | Unverified. [Elgato, Emotes guide (third-party)](https://developer.elgato.com/en/graphics/emotes) |
| Social avatar master | 1080 × 1080 px |  | International | Unverified. [Influencer Marketing Hub, LinkedIn image size recommendations (third-party)](https://influencermarketinghub.com/linkedin-image-size/) |
| Company page logo | 400 × 400 px |  | International | Unverified. [Influencer Marketing Hub, LinkedIn image size recommendations (third-party)](https://influencermarketinghub.com/linkedin-image-size/) |
| Video watermark | 150 × 150 px |  | International | [YouTube Help, Manage your channel branding](https://support.google.com/youtube/answer/10456525) |
