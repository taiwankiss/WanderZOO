// 設施圖示：地圖上的圓形圖釘和右下角圖例共用
const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const FACILITIES = {
  wc: {
    name: '化妝室', color: '#3c6e8f',
    icon: svg('<circle cx="7" cy="4.5" r="1.6"/><path d="M7 8v12M4.5 8h5v6h-5z"/><circle cx="17" cy="4.5" r="1.6"/><path d="M17 8l-3 8h6l-3-8zM15.5 16v4M18.5 16v4"/>'),
  },
  nursing: {
    name: '哺乳室', color: '#b06aa0',
    icon: svg('<path d="M9 3h6M10 3v3l-2 3v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l-2-3V3"/><path d="M8 13h8"/>'),
  },
  access: {
    name: '無障礙設施', color: '#2f7fb8',
    icon: svg('<circle cx="11" cy="4" r="1.6"/><path d="M11 7v6h5l2 6"/><path d="M8 10.5a5.5 5.5 0 1 0 7.5 7.3"/>'),
  },
  aed: {
    name: '自動體外心臟電擊去顫器（AED）', color: '#d6404b',
    icon: svg('<path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z"/><path d="M12.5 8.5L10.5 12h3l-2 3.5"/>'),
  },
  corridor: {
    name: '保育廊道（解說展示）', color: '#e07a4c',
    icon: svg('<path d="M3 10l9-6 9 6"/><path d="M5 10v10M19 10v10M9 20v-6h6v6"/>'),
  },
  info: {
    name: '遊客服務中心', color: '#6aa83a',
    icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  },
  store: {
    name: '便利商店', color: '#e07a4c',
    icon: svg('<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  },
  food: {
    name: '餐飲服務', color: '#e09a2c',
    icon: svg('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7h3"/>'),
  },
};
