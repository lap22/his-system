using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HIS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddQueueConcurrencyConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "AppointmentDate",
                table: "QueueEntries",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<Guid>(
                name: "DoctorId",
                table: "QueueEntries",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
            migrationBuilder.Sql("""
                UPDATE q
                 SET
                 q.DoctorId = a.DoctorId,
                 q.AppointmentDate = a.AppointmentDate
                 FROM dbo.QueueEntries q
                 INNER JOIN dbo.Appointments a
                 ON q.AppointmentId = a.Id;
                """);
            migrationBuilder.Sql("""
                IF EXISTS (
                SELECT 1
                FROM dbo.QueueEntries
                WHERE DoctorId = '00000000-0000-0000-0000-000000000000'
                OR AppointmentDate = '0001-01-01'
                )
                BEGIN
                THROW 50001,
                    'QueueEntries backfill failed.',
                    1;
                END
                """);
            migrationBuilder.CreateIndex(
                name: "IX_QueueEntries_DoctorId_AppointmentDate_QueueNumber",
                table: "QueueEntries",
                columns: new[] { "DoctorId", "AppointmentDate", "QueueNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_QueueEntries_DoctorId_AppointmentDate_QueueNumber",
                table: "QueueEntries");

            migrationBuilder.DropColumn(
                name: "AppointmentDate",
                table: "QueueEntries");

            migrationBuilder.DropColumn(
                name: "DoctorId",
                table: "QueueEntries");
        }
    }
}
