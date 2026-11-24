import { z } from 'zod'
import caseData from '../../data/case.json'
import { findingSchema } from './schema'

export type { Finding } from './schema'

export const CASE = caseData
// Fail loudly at startup if the case file's findings are not in the shape the app relies on.
export const FINDINGS = z.array(findingSchema).parse(caseData.findings)
