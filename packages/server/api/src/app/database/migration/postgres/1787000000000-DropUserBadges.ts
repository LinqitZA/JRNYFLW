import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropUserBadges1787000000000 implements MigrationInterface {
    name = 'DropUserBadges1787000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user_badge" DROP CONSTRAINT IF EXISTS "FK_dc6bb11dce7a0a591b5cae0af25"
        `)
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_user_badge_user_id"
        `)
        await queryRunner.query(`
            DROP TABLE IF EXISTS "user_badge"
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_badge" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "userId" character varying(21) NOT NULL,
                CONSTRAINT "idx_user_badge_user_id_name" UNIQUE ("userId", "name"),
                CONSTRAINT "PK_c5db2542e028558c5306c9d7f42" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_user_badge_user_id" ON "user_badge" ("userId")
        `)
        await queryRunner.query(`
            ALTER TABLE "user_badge"
            ADD CONSTRAINT "FK_dc6bb11dce7a0a591b5cae0af25" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

}
