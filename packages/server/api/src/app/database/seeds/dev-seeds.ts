import { ApEdition, ApEnvironment, UserIdentityProvider } from '@activepieces/shared'
import { authenticationService } from '../../authentication/authentication.service'
import { FlagEntity } from '../../flags/flag.entity'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { platformService } from '../../platform/platform.service'
import { databaseConnection } from '../database-connection'
import { DataSeed } from './data-seed'

const DEV_DATA_SEEDED_FLAG = 'DEV_DATA_SEEDED'
const log = system.globalLogger()

const currentEnvIsNotDev = (): boolean => {
    const env = system.get(AppSystemProp.ENVIRONMENT)
    const edition = system.get(AppSystemProp.EDITION)
    return env !== ApEnvironment.DEVELOPMENT  || edition === ApEdition.ENTERPRISE
}

const devDataAlreadySeeded = async (): Promise<boolean> => {
    const flagRepo = databaseConnection().getRepository(FlagEntity)
    const devSeedsFlag = await flagRepo.findOneBy({ id: DEV_DATA_SEEDED_FLAG })
    return devSeedsFlag?.value === true
}

const setDevDataSeededFlag = async (): Promise<void> => {
    const flagRepo = databaseConnection().getRepository(FlagEntity)

    await flagRepo.save({
        id: DEV_DATA_SEEDED_FLAG,
        value: true,
    })
}

const seedDevUser = async (): Promise<void> => {
    const ADMIN_EMAIL = 'admin@jrny.test'
    const ADMIN_PASSWORD = 'Admin123!@#'


    const response = await authenticationService(log).signUp({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        firstName: 'Admin',
        lastName: 'User',
        trackEvents: false,
        platformId: null,
        newsLetter: false,
        provider: UserIdentityProvider.EMAIL,
    })

    await platformService(log).createPlatformWithProject({
        identityId: response.id,
        name: 'JRNYFLW',
        invalidatePreviousTokens: true,
    })

    log.info({ email: ADMIN_EMAIL }, '[devSeeds#seedDevUser] Admin user and platform created')
}
const seedDevData = async (): Promise<void> => {
    if (currentEnvIsNotDev()) {
        log.info('[devSeeds#seedDevData] Skipping, not in development environment')
        return
    }

    if (await devDataAlreadySeeded()) {
        log.info('[devSeeds#seedDevData] Skipping, already seeded')
        return
    }

    await seedDevUser()
    await setDevDataSeededFlag()
}

export const devDataSeed: DataSeed = {
    run: seedDevData,
}
