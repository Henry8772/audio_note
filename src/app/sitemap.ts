import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://hearo.henryai.studio';
  const lastModified = new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/app`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/video-demo`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
