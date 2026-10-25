# Chrome Web Store Listing — AO3 Accessibility Helper

> Last Updated: 2026-10-23

## Store Listing

**Extension Name** [REQUIRED]
AO3 Accessibility Helper

**Short Description** [REQUIRED]
Checks work HTML on Archive of Our Own (AO3) for common accessibility issues before you post.

**Detailed Description** [REQUIRED]
AO3 Accessibility Helper helps fanfiction authors and creators make their stories welcoming to screen reader and assistive technology users on Archive of Our Own (AO3).

Key Features:
Checks your work HTML right below the Work Text box on AO3's Post New Work and Edit Work/Chapter pages
Flags images missing alt attributes or using filenames/placeholders as alt text
Identifies symbol scene breaks (like *** or ---) that screen readers read out literally and suggests semantic horizontal rules (<hr>)
Catches skipped heading levels, empty headings, and vague or unlabeled links
Highlights consecutive <br><br> line breaks, inaccessible table markup, unlabeled <details> disclosures, and deprecated tags
Provides a one-click "Highlight in HTML" button on every warning to jump straight to the exact line in your work text

How to Use:
1. Open the Post New Work or Edit Work/Chapter page on Archive of Our Own (archiveofourown.org).
2. Type or paste your story HTML into the Work Text editor.
3. Review any warnings in the AO3 Accessibility Check panel directly beneath the editor and click "Highlight in HTML" to jump to and fix each issue.

Privacy & Permissions:
Everything runs locally inside your browser on AO3's work editor pages. Your drafts, story text, and browsing activity never leave your device and are never collected or transmitted anywhere.

**Category** [REQUIRED]
Accessibility

**Single Purpose** [REQUIRED]
Checks HTML entered into Archive of Our Own (AO3) work and chapter editors for common accessibility issues and shows inline fix suggestions.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `src/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | PNG | ✅ Ready | `docs/screenshot.png` |

### Screenshot Notes
- Screenshot 1: Show AO3's Post New Work page with sample HTML in the Work Text box and the AO3 Accessibility Check panel beneath it displaying warnings for a missing `alt` attribute and an ASCII `***` scene break.
- Screenshot 2: Show the AO3 Accessibility Check panel in its green "No accessibility issues detected" state after fixing the HTML.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `https://archiveofourown.org/*`, `https://*.archiveofourown.org/*` (via `content_scripts.matches`) | host_permissions | Required to render the accessibility warning panel beneath the work HTML textarea on Archive of Our Own's work creation and chapter editing pages. No extra API permissions are requested. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
Not required when no user data is collected, or link to the repository's privacy statement confirming zero data collection.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
AO3 Accessibility Helper Contributors

**Contact Email** [REQUIRED]
Add publisher contact email in Chrome Developer Dashboard before submission.

**Support URL / Email** [RECOMMENDED]
GitHub repository Issues page

**Homepage URL** [RECOMMENDED]
GitHub repository URL

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-23 | Initial release supporting 10 AO3 HTML accessibility rules, inline warning panel, and one-click HTML highlighting for Chrome, Firefox, and Edge. | Draft |

## Review Notes

### Known Issues / Limitations
- Inspects the HTML editor `<textarea>` on AO3 work/chapter creation and editing pages.
