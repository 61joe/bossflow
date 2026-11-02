import type { CredentialSource, ModelProfile } from '../config/index.js';

export type DoctorReport =
  | {
      readonly nodeVersion: string;
      readonly configFound: false;
    }
  | {
      readonly nodeVersion: string;
      readonly configFound: true;
      readonly modelProfileName: string;
      readonly modelProfile: ModelProfile;
      readonly credentialSource: CredentialSource;
      readonly credentialEnvName: string;
    };
