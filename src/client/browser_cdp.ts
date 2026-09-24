/**
 * Browser CDP Client (Playwright over Chrome DevTools Protocol)
 *
 * Implements browser automation for Airtable Interface Designer:
 * - Direct CDP connection to user's running Chrome session (default port 9223)
 * - Automatic detection/reuse of existing Airtable tabs
 * - Interface navigation and Edit Mode enforcement
 * - Robust DOM automation recipes for headers, sidebars, kanbans, column locks, detail sheets, and publishing
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type {
  InterfaceLayoutType,
  InterfaceConfigureDetailSheetArgs,
} from '../types/index.js';

export interface CdpSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class BrowserCdpClient {
  private defaultPort: number;

  constructor(defaultPort = 9223) {
    this.defaultPort =
      Number(process.env.AIRTABLE_CDP_PORT) || defaultPort;
  }

  /**
   * Connect to running Chrome instance via CDP and find or open the target Airtable page
   */
  async getAirtablePage(
    baseId: string,
    cdpPort?: number,
    targetUrl?: string
  ): Promise<CdpSession> {
    const port = cdpPort || this.defaultPort;
    const endpoint = `http://127.0.0.1:${port}`;

    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(endpoint);
    } catch (err: any) {
      throw new Error(
        `Failed to connect to Chrome at ${endpoint}. Make sure Chrome is started with remote debugging:\n` +
          `google-chrome --remote-debugging-port=${port} (or /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port})\n` +
          `Error details: ${err.message}`
      );
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error(`Connected to Chrome at ${endpoint} but found 0 browser contexts.`);
    }

    const context = contexts[0];
    const pages = context.pages();

    // Look for an existing page matching the baseId
    let page = pages.find((p) => p.url().includes(baseId));

    if (page) {
      await page.bringToFront();
      if (targetUrl && !page.url().includes(targetUrl)) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
    } else {
      // Find any airtable page or open a new tab
      const airtablePage = pages.find((p) => p.url().includes('airtable.com'));
      if (airtablePage) {
        page = airtablePage;
        await page.bringToFront();
        const urlToOpen = targetUrl || `https://airtable.com/${baseId}`;
        await page.goto(urlToOpen, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        page = await context.newPage();
        const urlToOpen = targetUrl || `https://airtable.com/${baseId}`;
        await page.goto(urlToOpen, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
    }

    await page.waitForLoadState('domcontentloaded');
    return { browser, context, page };
  }

  /**
   * Ensure the current interface page is in Edit Mode
   */
  async ensureEditMode(page: Page, baseId: string, pageId?: string): Promise<void> {
    const currentUrl = page.url();

    // If pageId provided and not on it, navigate directly
    if (pageId && !currentUrl.includes(pageId)) {
      await page.goto(`https://airtable.com/${baseId}/${pageId}/edit`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1000);
      return;
    }

    // If not ending in /edit, check for edit button or append /edit
    if (!currentUrl.endsWith('/edit') && !currentUrl.includes('/edit?')) {
      const editBtn = page.locator(
        'button:has-text("Edit interface"), button[aria-label*="Edit interface"], button[data-tutorial-selector-id="interfaceStartEditing"]'
      ).first();

      if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(1000);
      } else if (currentUrl.includes(baseId)) {
        const editUrl = currentUrl.split('?')[0] + '/edit';
        await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
      }
    }
  }

  /**
   * Rebrand interface title and sidebar page bundles
   */
  async rebrandInterface(
    page: Page,
    options: { title?: string; sidebarBundleName?: string }
  ): Promise<{ rebrandedTitle?: boolean; rebrandedSidebar?: boolean }> {
    let rebrandedTitle = false;
    let rebrandedSidebar = false;

    // 1. Rebrand Header Title
    if (options.title) {
      const brandBtn = page
        .locator('button[aria-label^="Rename"], [data-testid="interface-header-title"], div[role="heading"]:has-text("Interface")')
        .first();

      if (await brandBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await brandBtn.dblclick();
        await page.waitForTimeout(300);

        const brandInput = page.locator(
          'input[aria-label="New page name"], input[type="text"]:focus, input.focus-visible'
        ).first();

        if (await brandInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await brandInput.fill(options.title);
          await brandInput.press('Enter');
          rebrandedTitle = true;
          await page.waitForTimeout(500);
        }
      }
    }

    // 2. Rebrand Sidebar Page Bundle / Folder
    if (options.sidebarBundleName) {
      const folderSection = page
        .locator('[data-testid="pageBundleSection"], div.pageBundle, [data-testid="sidebar-page-group"]')
        .first();

      if (await folderSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        const textTarget = folderSection.locator('div.flex-auto.truncate, span.truncate').first();
        if (await textTarget.isVisible()) {
          await textTarget.dblclick();
          await page.waitForTimeout(300);

          const folderInput = page.locator('input[aria-label="New page name"], input:focus').first();
          if (await folderInput.isVisible()) {
            await folderInput.fill(options.sidebarBundleName);
            await folderInput.press('Enter');
            rebrandedSidebar = true;
            await page.waitForTimeout(500);
          }
        }
      }
    }

    return { rebrandedTitle, rebrandedSidebar };
  }

  /**
   * Create a new Interface Page (Dashboard, Kanban, Grid, Record review)
   */
  async createInterfacePage(
    page: Page,
    options: {
      pageName: string;
      layoutType: InterfaceLayoutType;
      tableName: string;
    }
  ): Promise<{ success: boolean; pageUrl: string }> {
    // 1. Click "+ Add page" or "+ New page" in sidebar
    const addPageBtn = page.locator(
      'button:has-text("Add page"), button[aria-label*="Add page"], button:has-text("Create page"), button:has-text("New page")'
    ).first();

    await addPageBtn.waitFor({ state: 'visible', timeout: 8000 });
    await addPageBtn.click();
    await page.waitForTimeout(800);

    // 2. Map layout type to selector
    const layoutMap: Record<InterfaceLayoutType, RegExp> = {
      dashboard: /Dashboard/i,
      kanban: /Kanban/i,
      grid: /Grid|List/i,
      record_review: /Record review|Review/i,
    };

    const targetPattern = layoutMap[options.layoutType] || /Kanban/i;
    const layoutOption = page.locator('div, button').filter({ hasText: targetPattern }).first();

    if (await layoutOption.isVisible({ timeout: 4000 }).catch(() => false)) {
      await layoutOption.click();
      await page.waitForTimeout(600);
    }

    // 3. Select Data source table if prompted
    const tableSelectBtn = page.locator('button, div[role="combobox"]').filter({ hasText: /Select a table|Choose table|Table/i }).first();
    if (await tableSelectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tableSelectBtn.click();
      await page.waitForTimeout(300);
      const tableChoice = page.locator('[role="option"], div').filter({ hasText: new RegExp(`^${options.tableName}$`, 'i') }).first();
      if (await tableChoice.isVisible()) {
        await tableChoice.click();
        await page.waitForTimeout(400);
      }
    }

    // 4. Input Page Name
    const nameInput = page.locator('input[placeholder*="Page name"], input[aria-label*="page name"], input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(options.pageName);
      await page.waitForTimeout(300);
    }

    // 5. Click Next / Done / Create
    const createBtn = page.locator('button:has-text("Create page"), button:has-text("Next"), button:has-text("Done")').last();
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1500);
    }

    return {
      success: true,
      pageUrl: page.url(),
    };
  }

  /**
   * Configure Kanban Pipeline: Stack by stage, select visible front-of-card badges
   */
  async configureKanban(
    page: Page,
    options: {
      stackByField: string;
      cardFields?: string[];
    }
  ): Promise<{ success: boolean; stackedField: string }> {
    // 1. Locate Stacking / Grouping selector
    const stackDropdown = page
      .locator('button, div[role="combobox"]')
      .filter({ hasText: /Stack by|Group by|None/i })
      .first();

    if (await stackDropdown.isVisible({ timeout: 4000 }).catch(() => false)) {
      await stackDropdown.click();
      await page.waitForTimeout(400);

      // Select target stage field option
      const opt = page
        .locator('[role="option"], [role="menuitem"], div')
        .filter({ hasText: new RegExp(`^${options.stackByField}$`, 'i') })
        .last();

      if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await opt.click();
        await page.waitForTimeout(500);
      }
    }

    // 2. Unhide card fields if specified
    if (options.cardFields && options.cardFields.length > 0) {
      const fieldsBtn = page.locator('button').filter({ hasText: /visible|fields/i }).first();
      if (await fieldsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fieldsBtn.click();
        await page.waitForTimeout(500);

        for (const fieldName of options.cardFields) {
          const fieldRow = page
            .locator('.hover-container, div[role="row"], div.flex.items-center')
            .filter({ hasText: new RegExp(fieldName, 'i') })
            .first();

          if (await fieldRow.isVisible({ timeout: 1000 }).catch(() => false)) {
            const toggleIcon = fieldRow.locator('div[class*="parent-hover-flex"], svg, input[type="checkbox"]').first();
            if (await toggleIcon.isVisible()) {
              await toggleIcon.click();
              await page.waitForTimeout(200);
            }
          }
        }

        await page.keyboard.press('Escape');
      }
    }

    return {
      success: true,
      stackedField: options.stackByField,
    };
  }

  /**
   * Set column-level inline editing permission on grid/table views (Locked vs. Editable)
   */
  async setColumnInlineEditing(
    page: Page,
    columnName: string,
    allowInline = false
  ): Promise<boolean> {
    // Column headers in Airtable grid interface appear around y: ~200-300px
    const header = page
      .locator('span, div')
      .filter({ hasText: new RegExp(`^${columnName}$`, 'i') })
      .first();

    if (!(await header.isVisible({ timeout: 3000 }).catch(() => false))) {
      return false;
    }

    await header.click();
    await page.waitForTimeout(400);

    // Inspector panel on right displays "Edit this column inline"
    const label = page
      .locator('label')
      .filter({ hasText: 'Edit this column inline' })
      .first();

    if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isCurrentlyOn = await label.locator('[data-testid="switch-on"]').isVisible().catch(() => false);

      if (allowInline && !isCurrentlyOn) {
        await label.click(); // Turn ON
        await page.waitForTimeout(300);
      } else if (!allowInline && isCurrentlyOn) {
        await label.click(); // Turn OFF (Lock)
        await page.waitForTimeout(300);
      }
      return true;
    }

    return false;
  }

  /**
   * Configure opening record detail side-sheet (title field, lock toggles)
   */
  async configureDetailSheet(
    page: Page,
    options: InterfaceConfigureDetailSheetArgs
  ): Promise<{ success: boolean; lockedCount: number; editableCount: number }> {
    let lockedCount = 0;
    let editableCount = 0;

    // 1. Ensure "Click into record details" toggle is ON
    const detailToggle = page
      .locator('label')
      .filter({ hasText: 'Click into record details' })
      .first();

    if (await detailToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isCurrentlyOn = await detailToggle
        .locator('[data-testid="switch-on"]')
        .isVisible()
        .catch(() => false);
      if (!isCurrentlyOn) {
        await detailToggle.click();
        await page.waitForTimeout(500);
      }
    }

    // 2. Lock or unlock specified fields in side-sheet
    if (options.locked_fields) {
      for (const field of options.locked_fields) {
        const fieldBlock = page.locator('div, span').filter({ hasText: new RegExp(`^${field}$`, 'i') }).first();
        if (await fieldBlock.isVisible({ timeout: 1500 }).catch(() => false)) {
          await fieldBlock.click();
          await page.waitForTimeout(300);

          const allowEditToggle = page.locator('label:has-text("Allow inline editing"), label:has-text("Editable")').first();
          if (await allowEditToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
            const isCurrentlyOn = await allowEditToggle.locator('[data-testid="switch-on"]').isVisible().catch(() => false);
            if (isCurrentlyOn) {
              await allowEditToggle.click();
              lockedCount++;
              await page.waitForTimeout(200);
            }
          }
        }
      }
    }

    if (options.editable_fields) {
      for (const field of options.editable_fields) {
        const fieldBlock = page.locator('div, span').filter({ hasText: new RegExp(`^${field}$`, 'i') }).first();
        if (await fieldBlock.isVisible({ timeout: 1500 }).catch(() => false)) {
          await fieldBlock.click();
          await page.waitForTimeout(300);

          const allowEditToggle = page.locator('label:has-text("Allow inline editing"), label:has-text("Editable")').first();
          if (await allowEditToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
            const isCurrentlyOn = await allowEditToggle.locator('[data-testid="switch-on"]').isVisible().catch(() => false);
            if (!isCurrentlyOn) {
              await allowEditToggle.click();
              editableCount++;
              await page.waitForTimeout(200);
            }
          }
        }
      }
    }

    return { success: true, lockedCount, editableCount };
  }

  /**
   * Deterministically finalize and publish interface changes
   */
  async publishInterface(page: Page): Promise<{ published: boolean }> {
    const publishBtn = page
      .locator(
        'button[data-tutorial-selector-id="interfaceFinishEditing"], button:has-text("Publish"), button:has-text("Publish changes")'
      )
      .first();

    if (await publishBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      if (await publishBtn.isEnabled()) {
        await publishBtn.click();
        await page.waitForTimeout(1500);

        // Handle "Publish interfaces" multi-page confirmation modal if present
        const confirmBtn = page
          .locator('div[role="dialog"] button, button')
          .filter({ hasText: /^Publish$/i })
          .last();

        if (await confirmBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
        }

        return { published: true };
      }
    }

    return { published: false };
  }
}
