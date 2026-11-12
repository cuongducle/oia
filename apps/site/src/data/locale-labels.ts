// Vietnamese labels for taxonomy slugs; template names stay as shipped.
export const CATEGORY_VI: Record<string, string> = {
  'flash-sale': 'Sale chớp nhoáng',
  'new-product': 'Sản phẩm mới',
  livestream: 'Livestream',
  menu: 'Thực đơn',
  'social-post': 'Bài mạng xã hội',
  deck: 'Thuyết trình',
  poster: 'Poster',
  overlay: 'Khung phủ',
}

export const COLLECTION_VI: Record<string, string> = {
  swiss: 'Swiss',
  editorial: 'Editorial',
  'cafe-restaurant': 'Gói quán cà phê',
  'product-launch': 'Gói ra mắt sản phẩm',
  'tet-sale': 'Gói sale Tết',
}

export const viLabel = (slug: string) => CATEGORY_VI[slug] ?? COLLECTION_VI[slug] ?? slug
