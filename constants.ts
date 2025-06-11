

import type { User, Chat, Message } from './types';

// MOCK_USERS are now primarily for initial seeding if localStorage is empty
export const MOCK_USERS: User[] = [];

// Chats will be dynamically created and stored in localStorage
export const MOCK_CHATS: Chat[] = [];

// Messages will be dynamically created and stored in localStorage
export const MOCK_MESSAGES: { [key: string]: Message[] } = {};

export const AI_SUGGESTED_REPLIES = [
  "Okay, sounds good!",
  "I'll take a look.",
  "Thanks for letting me know.",
  "Can we discuss this further?",
  "I'm not sure, let me check."
];

export interface ChatBackgroundOption {
  id: string;
  nameKey: string; // Translation key for the name
  thumbnailUrl: string;
  fullUrl: string | null; // null for default/no background image. Can be image URL, CSS gradient string, or SVG data URL.
}

export const PREDEFINED_CHAT_BACKGROUNDS: ChatBackgroundOption[] = [
  { id: 'default', nameKey: 'chat_background_default', thumbnailUrl: 'https://via.placeholder.com/100/F0F2F5/CCCCCC.png?text=Default', fullUrl: null },
  { id: 'bg1', nameKey: 'Abstract Waves', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb1/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full1/800/1200' },
  { id: 'bg2', nameKey: 'Cool Geometry', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb2/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full2/800/1200' },
  { id: 'bg3', nameKey: 'Night Sky', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb3/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full3/800/1200' },
  { id: 'bg4', nameKey: 'Pastel Dreams', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb4/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full4/800/1200' },
  { id: 'bg5', nameKey: 'Minimalist Grid', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb5/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full5/800/1200' },
  
  // New Color/Pattern Backgrounds
  {
    id: 'gradientSkyBlue',
    nameKey: 'chat_background_gradient_sky_blue',
    thumbnailUrl: 'https://via.placeholder.com/100/87CEEB/ADD8E6.png?text=Sky',
    fullUrl: 'linear-gradient(to bottom right, #87CEEB, #ADD8E6)'
  },
  {
    id: 'gradientSoftLavender',
    nameKey: 'chat_background_gradient_soft_lavender',
    thumbnailUrl: 'https://via.placeholder.com/100/E6E6FA/D8BFD8.png?text=Lavender',
    fullUrl: 'linear-gradient(135deg, #E6E6FA 0%, #D8BFD8 100%)'
  },
  {
    id: 'patternDarkDots',
    nameKey: 'chat_background_pattern_dark_dots',
    thumbnailUrl: 'https://via.placeholder.com/100/333333/444444.png?text=Dots',
    fullUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="%23333333"/><circle cx="5" cy="5" r="1" fill="%234A4A4A"/><circle cx="15" cy="15" r="1" fill="%234A4A4A"/></svg>`
  },
  {
    id: 'patternLightLines',
    nameKey: 'chat_background_pattern_light_lines',
    thumbnailUrl: 'https://via.placeholder.com/100/F5F5DC/E0E0D1.png?text=Lines',
    fullUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="%23F5F5DC"/><path d="M0 0L20 20M-5 15L5 25M15 -5L25 5" stroke="%23E0E0D1" stroke-width="0.5"/></svg>`
  },
  {
    id: 'solidMintGreen',
    nameKey: 'chat_background_solid_mint_green',
    thumbnailUrl: 'https://via.placeholder.com/100/98FF98/98FF98.png?text=Mint',
    fullUrl: '#98FB98' // Using hex for solid color
  },
  {
    id: 'solidPaleYellow',
    nameKey: 'chat_background_solid_pale_yellow',
    thumbnailUrl: 'https://via.placeholder.com/100/FFFFE0/FFFFE0.png?text=Yellow',
    fullUrl: '#FFFFE0' // Using hex for solid color
  },

  // Existing image backgrounds (keep some for variety)
  { id: 'bg6', nameKey: 'Forest Path', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb6/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full6/800/1200' },
  { id: 'bg7', nameKey: 'Ocean Breeze', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb7/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full7/800/1200' },
  { id: 'bg10', nameKey: 'Dark Matter', thumbnailUrl: 'https://picsum.photos/seed/chatbg_thumb10/100/100', fullUrl: 'https://picsum.photos/seed/chatbg_full10/800/1200' },
];
// Note: For actual use, replace picsum.photos and via.placeholder.com with actual image assets or more refined SVGs/CSS.
// The default thumbnail should be a simple representation of the default chat background (e.g., a plain color tile).