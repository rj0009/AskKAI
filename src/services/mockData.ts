import { Source } from '../types';

export const mockSources: Source[] = [
  {
    id: 'jira-1',
    type: 'Jira',
    title: 'EPES-124: Implement System Architecture for EPES',
    url: 'https://jira.ncss.gov.sg/browse/EPES-124',
    content: 'The system architecture for EPES involves a microservices approach using Node.js and React. The database is PostgreSQL. Deployment is on Cloud Run.',
    lastUpdated: '2026-03-15',
  },
  {
    id: 'jira-epes-2',
    type: 'Jira',
    title: 'EPES-205: Sprint 12 Blockers',
    url: 'https://jira.ncss.gov.sg/browse/EPES-205',
    content: 'Sprint 12 is currently blocked by the delay in MSF Identity Provider integration. Estimated resolution is next week.',
    lastUpdated: '2026-04-09',
  },
  {
    id: 'conf-1',
    type: 'Confluence',
    title: 'EPES System Architecture Design',
    url: 'https://confluence.ncss.gov.sg/display/EPES/Architecture',
    content: 'Latest architecture diagram shows the integration between the frontend and the backend services. Authentication is handled via MSF Identity Provider.',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'conf-2',
    type: 'Confluence',
    title: 'NCSS Data Governance Policy',
    url: 'https://confluence.ncss.gov.sg/display/GOV/Data+Policy',
    content: 'All systems must comply with the NCSS Data Governance framework. Data classification levels: Restricted, Confidential, and Public. PII must be encrypted at rest.',
    lastUpdated: '2026-01-20',
  },
  {
    id: 'conf-3',
    type: 'Confluence',
    title: 'MSF Identity Provider Integration Guide',
    url: 'https://confluence.ncss.gov.sg/display/TECH/MSF+IDP+Integration',
    content: 'Step-by-step guide for integrating applications with MSF IDP using OIDC. Requires client ID and secret from the NCSS Security Team.',
    lastUpdated: '2026-03-10',
  },
  {
    id: 'conf-4',
    type: 'Confluence',
    title: 'EPES User Manual - Release 1.0',
    url: 'https://confluence.ncss.gov.sg/display/EPES/User+Manual',
    content: 'Comprehensive guide for case workers using the EPES system. Covers case creation, assessment workflows, and reporting modules.',
    lastUpdated: '2026-04-02',
  },
  {
    id: 'gitlab-1',
    type: 'GitLab',
    title: 'epes-frontend / README.md',
    url: 'https://gitlab.ncss.gov.sg/epes/frontend/-/blob/main/README.md',
    content: 'Frontend project for EPES. Built with Vite, React, and Tailwind CSS. CI/CD pipeline is configured to deploy to development environment on every merge to main.',
    lastUpdated: '2026-04-05',
  },
  {
    id: 'gitlab-epes-2',
    type: 'GitLab',
    title: 'epes-backend / Pipeline Status',
    url: 'https://gitlab.ncss.gov.sg/epes/backend/-/pipelines',
    content: 'Recent pipeline for main branch failed due to unresolved security vulnerabilities in the base image. Security scan identified 3 critical issues.',
    lastUpdated: '2026-04-08',
  },
  {
    id: 'jira-2',
    type: 'Jira',
    title: 'PROJ-X-45: Release Risks for Project X',
    url: 'https://jira.ncss.gov.sg/browse/PROJ-X-45',
    content: 'Identified risks: 1. Delay in third-party API integration. 2. Pending security clearance for production deployment. 3. Resource shortage in QA team.',
    lastUpdated: '2026-04-08',
  },
  {
    id: 'sharepoint-1',
    type: 'SharePoint',
    title: 'Project X - Risk Assessment Matrix.xlsx',
    url: 'https://ncss.sharepoint.com/sites/ProjectX/RiskMatrix.xlsx',
    content: 'The risk assessment matrix highlights high-impact risks related to data privacy and compliance with MSF ITG standards.',
    lastUpdated: '2026-04-02',
  },
  {
    id: 'jira-projx-3',
    type: 'Jira',
    title: 'PROJ-X-12: Unresolved Sev 1 Defects',
    url: 'https://jira.ncss.gov.sg/browse/PROJ-X-12',
    content: 'There are currently 2 unresolved Sev 1 defects related to data leakage in the reporting module. Assigned to Tech Lead for immediate action.',
    lastUpdated: '2026-04-09',
  },
  {
    id: 'gitlab-sec-1',
    type: 'GitLab',
    title: 'Security Scan: Critical Vulnerabilities in epes-auth-service',
    url: 'https://gitlab.ncss.gov.sg/epes/auth-service/-/security/vulnerabilities',
    content: 'Critical: SQL Injection vulnerability detected in login endpoint. High: Outdated dependency (lodash < 4.17.21) with known prototype pollution. Medium: Missing security headers in nginx config.',
    lastUpdated: '2026-04-10',
  },
  {
    id: 'conf-outdated-1',
    type: 'Confluence',
    title: 'Notification Feature Specification (DRAFT)',
    url: 'https://confluence.ncss.gov.sg/display/EPES/Notification+Spec',
    content: 'This document describes the notification feature. Note: The architecture described here uses a legacy polling mechanism. The team has since moved to WebSockets, but this page has not been updated.',
    lastUpdated: '2025-11-12',
  },
  {
    id: 'jira-release-1',
    type: 'Jira',
    title: 'Release v2.3.1 - Deployment Checklist',
    url: 'https://jira.ncss.gov.sg/browse/REL-231',
    content: 'Tickets included: EPES-124, EPES-205. Status: All testing completed in UAT. Pending CAB approval.',
    lastUpdated: '2026-04-09',
  },
  {
    id: 'gitlab-mr-1',
    type: 'GitLab',
    title: 'MR !452: Implement WebSocket for Notifications',
    url: 'https://gitlab.ncss.gov.sg/epes/frontend/-/merge_requests/452',
    content: 'Merged by Tech Lead. Implements the new WebSocket-based notification system. Replaces the old polling logic.',
    lastUpdated: '2026-04-08',
  }
];

export const searchSources = (query: string): Source[] => {
  const lowerQuery = query.toLowerCase();
  return mockSources.filter(source => 
    source.title.toLowerCase().includes(lowerQuery) || 
    source.content.toLowerCase().includes(lowerQuery)
  );
};
