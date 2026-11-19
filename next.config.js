/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pzpnxexubweqseotnixv.supabase.co",
      },
    ],
  },
  async redirects() {
    return [
      // Preserve every public URL from the legacy bouncepartyla.com sitemap.
      // Existing routes such as /Blog, /customdecor, and /TermsOfService do not
      // need redirects because the new application serves them directly.
      { source: "/BubbleHouse", destination: "/catalog/bubble-house", permanent: true },
      { source: "/slidecombo", destination: "/catalog/bounce-slide-combo", permanent: true },
      { source: "/minibouncehouse", destination: "/catalog/mini-bounce-houses", permanent: true },
      { source: "/sets", destination: "/catalog/sets", permanent: true },
      { source: "/bouncehouses", destination: "/catalog/bounce-house", permanent: true },
      { source: "/softplay", destination: "/catalog/soft-play", permanent: true },
      { source: "/EQUIPMENTFORRENT", destination: "/catalog", permanent: true },
      { source: "/allproducts", destination: "/catalog", permanent: true },
      { source: "/Businesscard", destination: "/customdecor", permanent: true },
      { source: "/weddings", destination: "/customdecor", permanent: true },
      { source: "/photozone", destination: "/customdecor", permanent: true },
      { source: "/mirrorballs", destination: "/customdecor", permanent: true },
      { source: "/balloonsdecor", destination: "/customdecor", permanent: true },
      { source: "/kidsbirthday", destination: "/catalog", permanent: true },
      { source: "/New", destination: "/catalog", permanent: true },
      { source: "/moneyhouse", destination: "/catalog/bounce-house", permanent: true },
      { source: "/acousticsystemharbinger", destination: "/catalog", permanent: true },
      { source: "/acousticsystemld", destination: "/catalog", permanent: true },
      { source: "/gasolinepowered", destination: "/catalog", permanent: true },

      { source: "/bouncecake", destination: "/product/bounce-cake", permanent: true },
      { source: "/Sugarcandiesbook", destination: "/product/sugar-candies", permanent: true },
      { source: "/sugarcandies", destination: "/product/sugar-candies", permanent: true },
      { source: "/thewhitecastle", destination: "/product/white-castle", permanent: true },
      { source: "/thebluecastle", destination: "/product/blue-castle", permanent: true },
      { source: "/thepinkcastle", destination: "/product/pink-castle", permanent: true },
      { source: "/princesscastlewithslide", destination: "/product/princess-castle-with-slide", permanent: true },
      { source: "/whitecastlewithaslideandadrypool", destination: "/product/white-castle-slide-ball-pit", permanent: true },
      { source: "/themagnificentpalaceofagrabah", destination: "/product/palace-of-agrabah", permanent: true },
      { source: "/hugebubblehouse", destination: "/product/bubble-house", permanent: true },
      { source: "/bubblebouncehouse", destination: "/product/bubble-bounce-house", permanent: true },
      { source: "/whitecastlethreeinone", destination: "/product/white-castle-3-in-1", permanent: true },
      { source: "/bounceparty", destination: "/product/bounce-party", permanent: true },
      { source: "/skippy", destination: "/product/skippy", permanent: true },
      { source: "/minijumperwithslidesmallballpit", destination: "/product/mini-jumper-slide-small-ball-pit", permanent: true },
      { source: "/theroyalcastle", destination: "/product/royal-castle", permanent: true },
      { source: "/minijumperwithslidebigballpit", destination: "/product/mini-jumper-slide-big-ball-pit", permanent: true },
      { source: "/santabarbarapalace", destination: "/product/santa-barbara-palace", permanent: true },
      { source: "/softplayminibouncehousewithballpit", destination: "/product/new-soft-play-mini-bounce-house-ball-pit", permanent: true },
      { source: "/softplayminijumperwithslide", destination: "/product/new-soft-play-mini-jumper-slide-small-ball-pit", permanent: true },
      { source: "/newsoftplayballpit", destination: "/product/new-soft-play-ball-pit", permanent: true },
      { source: "/dreamslidecastle", destination: "/product/dream-slide-castle", permanent: true },
      { source: "/chateaublanc", destination: "/product/chateau-blanc", permanent: true },
      { source: "/casablanca", destination: "/product/casa-blanca", permanent: true },
      { source: "/newwhitecastle", destination: "/product/new-white-castle", permanent: true },

      { source: "/castlebubbleset", destination: "/catalog/sets", permanent: true },
      { source: "/castlethreeinoneandbubblebounce", destination: "/catalog/sets", permanent: true },
      { source: "/softplaysetone", destination: "/catalog/soft-play", permanent: true },
      { source: "/softplaysettwo", destination: "/catalog/soft-play", permanent: true },
      { source: "/sugarcandiesbubblebouncehouseset", destination: "/catalog/sets", permanent: true },
      { source: "/princesscastlebubblebouncehouse", destination: "/catalog/sets", permanent: true },
      { source: "/chateaublancbubblehouse", destination: "/catalog/sets", permanent: true },
      { source: "/magnificentpalaceofagrabahsugarcandiesbubblebounce", destination: "/catalog/sets", permanent: true },
      { source: "/bouncepartybubblebounce", destination: "/catalog/sets", permanent: true },

      { source: "/bouncepartyhalfsoftplay", destination: "/product/bounce-party-half-soft-play", permanent: true },
      { source: "/dreamslidecastlehalfsoftplay", destination: "/product/dream-slide-castle-half-soft-play", permanent: true },
      { source: "/whitecastlewithaslideandaballpithalfsoftplay", destination: "/product/white-castle-slide-ball-pit-half-soft-play", permanent: true },
      { source: "/whitecastlethreeinonehalfsoftplay", destination: "/product/white-castle-3-in-1-half-soft-play", permanent: true },
      { source: "/newwhitecastlehalfsoftplay", destination: "/product/new-white-castle-half-soft-play", permanent: true },
      { source: "/santabarbarahalfsoftplay", destination: "/product/santa-barbara-palace-half-soft-play", permanent: true },
    ];
  },
}

module.exports = nextConfig
