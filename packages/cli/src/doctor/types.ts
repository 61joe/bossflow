import type { CredentialSource, ModelProfile } from '../config/index.js';

export interface DoctorReport {
  readonly nodeVersion: string;
  readonly configFound: boolean;
  readonly modelProfileName?: string;
  readonly modelProfile?: ModelProfile;
  readonly credentialSource?: CredentialSource;
  readonly credentialEnvName?: string;
}
