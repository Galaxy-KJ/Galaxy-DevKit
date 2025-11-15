/**
 * @fileoverview Type definitions for Galaxy CLI templates
 * @description Defines interfaces and types for template management
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

export interface TemplateConfig {
  name: string;
  description: string;
  version: string;
  author: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  files: TemplateFile[];
  postInstall?: string[];
}

export interface TemplateFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface TemplateMetadata {
  name: string;
  description: string;
  category: string;
  tags: string[];
  config: TemplateConfig;
}

export interface ProjectOptions {
  name: string;
  template: string;
  directory?: string;
  skipInstall?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
}

export type TemplateCategory = 'basic' | 'defi' | 'nft' | 'enterprise' | 'custom';

export interface DependencyInfo {
  name: string;
  version: string;
  isDev?: boolean;
}