/**
 * @fileoverview Template loader utility for Galaxy CLI
 * @description Handles loading, validating, and managing project templates
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { TemplateConfig, TemplateMetadata, TemplateCategory } from '../types/template-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TemplateLoader {
  private templatesDir: string;

  /**
   * Gets the templates directory path
   * @returns string
   */
  getTemplatesDir(): string {
    return this.templatesDir;
  }

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || process.env.TEMPLATES_DIR || path.resolve(__dirname, '../../packages/templates');
  }

  /**
   * Loads a template configuration
   * @param templateName - Name of the template to load
   * @returns Promise<TemplateConfig>
   */
  async loadTemplate(templateName: string): Promise<TemplateConfig> {
    const templatePath = path.join(this.templatesDir, templateName, 'template.json');

    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template '${templateName}' not found at ${templatePath}`);
    }

    try {
      const config = await fs.readJson(templatePath);
      return this.validateTemplateConfig(config);
    } catch (error) {
      throw new Error(`Failed to load template '${templateName}': ${(error as Error).message}`);
    }
  }

  /**
   * Lists all available templates
   * @returns Promise<TemplateMetadata[]>
   */
  async listTemplates(): Promise<TemplateMetadata[]> {
    const templates: TemplateMetadata[] = [];

    if (!await fs.pathExists(this.templatesDir)) {
      console.warn(chalk.yellow(`Templates directory not found: ${this.templatesDir}`));
      return templates;
    }

    const entries = await fs.readdir(this.templatesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const config = await this.loadTemplate(entry.name);
          templates.push({
            name: entry.name,
            description: config.description,
            category: this.inferCategory(entry.name),
            tags: this.extractTags(config),
            config
          });
        } catch (error) {
          console.warn(chalk.yellow(`Skipping invalid template '${entry.name}': ${(error as Error).message}`));
        }
      }
    }

    return templates;
  }

  /**
   * Validates template configuration
   * @param config - Template configuration to validate
   * @returns TemplateConfig
   */
  private validateTemplateConfig(config: any): TemplateConfig {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Template config must have a valid name');
    }

    if (!config.description || typeof config.description !== 'string') {
      throw new Error('Template config must have a valid description');
    }

    if (!config.version || typeof config.version !== 'string') {
      throw new Error('Template config must have a valid version');
    }

    if (!config.author || typeof config.author !== 'string') {
      throw new Error('Template config must have a valid author');
    }

    if (!Array.isArray(config.dependencies)) {
      config.dependencies = [];
    }

    if (!Array.isArray(config.devDependencies)) {
      config.devDependencies = [];
    }

    if (!config.scripts || typeof config.scripts !== 'object') {
      config.scripts = {};
    }

    if (!Array.isArray(config.files)) {
      config.files = [];
    }

    return config as TemplateConfig;
  }

  /**
   * Infers template category from name
   * @param templateName - Template name
   * @returns TemplateCategory
   */
  private inferCategory(templateName: string): TemplateCategory {
    const name = templateName.toLowerCase();

    if (name.includes('defi')) return 'defi';
    if (name.includes('nft')) return 'nft';
    if (name.includes('enterprise')) return 'enterprise';
    if (name.includes('basic')) return 'basic';

    return 'custom';
  }

  /**
   * Extracts tags from template config
   * @param config - Template configuration
   * @returns string[]
   */
  private extractTags(config: TemplateConfig): string[] {
    const tags: string[] = [];

    // Add category-based tags
    tags.push(config.name.toLowerCase());

    // Add dependency-based tags
    if (config.dependencies.some(dep => dep === 'react' || dep.startsWith('react@'))) tags.push('react');
    if (config.dependencies.some(dep => dep === '@stellar/stellar-sdk' || dep.startsWith('@stellar/stellar-sdk@'))) tags.push('stellar');
    if (config.dependencies.some(dep => dep === '@supabase/supabase-js' || dep.startsWith('@supabase/supabase-js@'))) tags.push('supabase');

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Checks if a template exists
   * @param templateName - Name of the template
   * @returns Promise<boolean>
   */
  async templateExists(templateName: string): Promise<boolean> {
    const templatePath = path.join(this.templatesDir, templateName, 'template.json');
    return await fs.pathExists(templatePath);
  }
}