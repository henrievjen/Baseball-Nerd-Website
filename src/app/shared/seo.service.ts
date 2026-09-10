import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';

const SITE_ORIGIN = 'https://baseballnerdsite.com';

@Injectable({ providedIn: 'root' })
export class SeoService {
  constructor(
    private titleService: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private doc: Document
  ) {}

  update(title: string, description: string): void {
    this.titleService.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
  }

  /**
   * Keeps <link rel="canonical"> in sync with the current route. Without
   * this, every prerendered route would keep index.html's hardcoded
   * homepage canonical, which tells search engines every other page is a
   * duplicate of "/" and shouldn't be indexed on its own.
   * Uses the injected DOCUMENT (not the global `document`) so it works
   * identically during server-side prerendering and in the browser.
   */
  updateCanonical(path: string): void {
    const cleanPath = (path || '/').split('?')[0].split('#')[0];
    const href = cleanPath === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${cleanPath}`;
    let link: HTMLLinkElement | null = this.doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
