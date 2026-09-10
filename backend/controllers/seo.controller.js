import Service from "../models/Service.js";

/**
 * Generate a dynamic sitemap.xml containing all static routes
 * and dynamically populated service routes for SEO.
 */
export const getDynamicSitemap = async (req, res) => {
  try {
    const services = await Service.find({ status: "active" }).select("_id updatedAt");

    const baseUrl = "https://skilledustaad.com";
    const today = new Date().toISOString().split("T")[0];

    // Static URLs
    const staticUrls = [
      { loc: "/", priority: "1.0", changefreq: "daily", lastmod: today },
      { loc: "/login", priority: "0.8", changefreq: "monthly", lastmod: today },
      { loc: "/signup", priority: "0.9", changefreq: "monthly", lastmod: today },
      { loc: "/moreservices", priority: "0.9", changefreq: "daily", lastmod: today },
      { loc: "/about", priority: "0.7", changefreq: "monthly", lastmod: today },
      { loc: "/contact", priority: "0.7", changefreq: "monthly", lastmod: today },
      { loc: "/privacy", priority: "0.3", changefreq: "yearly", lastmod: today },
      { loc: "/terms", priority: "0.3", changefreq: "yearly", lastmod: today }
    ];

    // Dynamic Service URLs
    const dynamicUrls = services.map(service => ({
      loc: `/booking/${service._id}`,
      priority: "0.9",
      changefreq: "weekly",
      lastmod: service.updatedAt ? service.updatedAt.toISOString().split("T")[0] : today
    }));

    const allUrls = [...staticUrls, ...dynamicUrls];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    allUrls.forEach(url => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${url.loc}</loc>\n`;
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
      xml += `    <priority>${url.priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (error) {
    console.error("Error generating sitemap:", error);
    res.status(500).send("Error generating sitemap");
  }
};
