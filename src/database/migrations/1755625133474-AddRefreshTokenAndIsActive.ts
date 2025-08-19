import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenAndIsActive1755625133474 implements MigrationInterface {
  name = 'AddRefreshTokenAndIsActive1755625133474';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "refreshToken" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refreshToken"`);
  }
}
