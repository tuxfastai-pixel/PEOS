import { z } from "zod";
import type { Pool } from "pg";
import { AdminError, assertSchoolAdmin, audit, transaction } from "./service";

const field = (max: number) => z.string().trim().max(max);
export const schoolProfileSchema = z.object({
  revision: z.number().int().min(0).max(2147483646),
  emisNumber: field(80), centreNumber: field(80), address: field(500),
  country: field(100), province: field(100), district: field(100), postalCode: field(30),
  phone: field(50), email: z.string().trim().pipe(z.union([z.literal(""), z.string().email().max(254)])),
  schoolType: field(100),
}).strict();
export type SchoolProfile = z.infer<typeof schoolProfileSchema>;
const columns = `revision, emis_number AS "emisNumber", centre_number AS "centreNumber", address, country, province, district, postal_code AS "postalCode", phone, email, school_type AS "schoolType"`;
export const emptySchoolProfile: SchoolProfile = {revision:0, emisNumber:"", centreNumber:"", address:"", country:"", province:"", district:"", postalCode:"", phone:"", email:"", schoolType:""};

export async function getSchoolProfile(pool: Pool, actor: string, schoolId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const result = await db.query(`SELECT ${columns} FROM organisation.school_profiles WHERE school_id=$1`, [schoolId]);
    return result.rows[0] ?? emptySchoolProfile;
  });
}

export async function saveSchoolProfile(pool: Pool, actor: string, schoolId: string, profile: SchoolProfile) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const values = [schoolId, profile.emisNumber, profile.centreNumber, profile.address, profile.country, profile.province, profile.district, profile.postalCode, profile.phone, profile.email, profile.schoolType, profile.revision];
    const result = await db.query(`INSERT INTO organisation.school_profiles
      (school_id,emis_number,centre_number,address,country,province,district,postal_code,phone,email,school_type,revision)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1 WHERE $12=0
      ON CONFLICT (school_id) DO UPDATE SET emis_number=$2,centre_number=$3,address=$4,country=$5,province=$6,district=$7,postal_code=$8,phone=$9,email=$10,school_type=$11,revision=organisation.school_profiles.revision+1
      WHERE organisation.school_profiles.revision=$12
      RETURNING ${columns}`, values);
    // Existing records use UPDATE because an INSERT with a nonzero revision has no source row.
    if (!result.rowCount && profile.revision > 0) {
      const updated = await db.query(`UPDATE organisation.school_profiles SET emis_number=$2,centre_number=$3,address=$4,country=$5,province=$6,district=$7,postal_code=$8,phone=$9,email=$10,school_type=$11,revision=revision+1 WHERE school_id=$1 AND revision=$12 RETURNING ${columns}`, values);
      if (!updated.rowCount) throw new AdminError("PROFILE_CONFLICT", 409);
      await audit(db, actor, "school.profile.update", schoolId, schoolId);
      return updated.rows[0];
    }
    if (!result.rowCount) throw new AdminError("PROFILE_CONFLICT", 409);
    await audit(db, actor, "school.profile.update", schoolId, schoolId);
    return result.rows[0];
  });
}
