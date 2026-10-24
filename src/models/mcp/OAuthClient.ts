import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * An app registered through dynamic client registration (RFC 7591), such as
 * Claude or ChatGPT. Global (not one workspace): the same registration may
 * connect to several workspaces. A client secret, when there is one, is
 * stored only as its SHA-256.
 */
const OAuthClientSchema = new Schema(
  {
    clientId: { type: String, required: true, unique: true },
    clientName: { type: String, required: true, maxlength: 100 },
    redirectUris: { type: [String], required: true },
    authMethod: { type: String, enum: ['none', 'client_secret_post', 'client_secret_basic'], default: 'none' },
    clientSecretHash: { type: String, default: null },
    clientUri: { type: String },
    logoUri: { type: String },
    softwareId: { type: String },
  },
  { timestamps: true },
)

export const OAuthClient = defineModel('OAuthClient', OAuthClientSchema)
