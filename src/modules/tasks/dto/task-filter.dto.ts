import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TaskPriority } from '../enums/task-priority.enum';
import { TaskStatus } from '../enums/task-status.enum';

export class TaskFilterDto {
  @ApiProperty({
    enum: TaskStatus,
    required: false,
    description: 'Filter tasks by status',
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({
    enum: TaskPriority,
    required: false,
    description: 'Filter tasks by priority',
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({
    required: false,
    description: 'Search tasks by title or description',
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  searchTerm?: string;

  @ApiProperty({
    required: false,
    description: 'Filter tasks by user ID',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter tasks by due date range start',
  })
  @IsISO8601()
  @IsOptional()
  dueDateStart?: string;

  @ApiProperty({
    required: false,
    description: 'Filter tasks by due date range end',
  })
  @IsISO8601()
  @IsOptional()
  dueDateEnd?: string;

  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number for pagination',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    required: false,
    default: 10,
    minimum: 1,
    maximum: 100,
    description: 'Number of items per page',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}
