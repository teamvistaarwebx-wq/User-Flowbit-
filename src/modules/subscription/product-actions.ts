'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { todayIST } from '@/lib/dates'
import { notifyPermission } from '@/lib/notify'

const productInput = z.object({ product: z.enum(PRODUCT_KEYS) })

/** A member without billing rights asks the people who have them to add a product (once a day per product). */
export const requestProduct = action(
  productInput,
  async ({ product }, ctx) => {
    const name = PRODUCTS[product].name
    const sent = await notifyPermission(ctx, 'billing.manage', {
      title: `${ctx.user.name} asked for ${name}`,
      body: `${PRODUCTS[product].tagline} Add it to your plan.`,
      href: `/app/locked?product=${product}`,
      kind: 'info',
      event: 'subscription.product_requested',
      product,
      dedupeKey: `product-request:${product}:${String(ctx.memberId)}:${todayIST()}`,
    })
    return ok(sent ? `We let your admins know you'd like ${name}.` : `Your admins already have your request for ${name}.`)
  },
  { allowReadOnly: true },
)
