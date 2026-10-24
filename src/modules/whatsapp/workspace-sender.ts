import 'server-only'
import { Types } from 'mongoose'
import { Org } from '@/models/Org'
import type { ChannelAdapter } from '@/modules/messaging/types'
import { consoleSettings } from '@/modules/console/settings-query'
import { liveChargeDeps } from '@/modules/wallet/account'
import { Wallet } from '@/models/wallet/Wallet'
import { allowanceFor } from '@/modules/wallet/rules'
import { senderConfig } from './connection'
import { liveFetch } from './platform-sender'
import { workspaceProvider } from './provider'
import { sendFromWorkspace, type WorkspaceSendDeps } from './workspace-core'

/** The live WhatsApp B channel: the workspace's own connection, its wallet and the Console prices. */

export function liveWorkspaceDeps(): WorkspaceSendDeps {
  return {
    async connection(orgId) {
      const config = await senderConfig(orgId)
      return config ? { mode: config.mode, provider: workspaceProvider(config, liveFetch) } : null
    },
    charge: liveChargeDeps(),
    async pricing(orgId) {
      const id = new Types.ObjectId(orgId)
      const [{ wallet }, org, own] = await Promise.all([consoleSettings(), Org.findById(id, { 'subscription.plan': 1, 'subscription.accountType': 1 }).lean(), Wallet.findOne({ orgId: id }, { freeAllowanceOverride: 1 }).lean()])
      return { settings: wallet, allowance: allowanceFor(org?.subscription, wallet, own?.freeAllowanceOverride) }
    },
  }
}

export function workspaceWhatsAppAdapter(): ChannelAdapter {
  return { channel: 'whatsapp', send: (message) => sendFromWorkspace(liveWorkspaceDeps(), message) }
}
