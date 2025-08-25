import { EntityRepository, Repository } from 'typeorm';
import { MasterGroup } from 'src/master-trading/entities/master-group.entity';

@EntityRepository(MasterGroup)
export class MasterGroupRepository extends Repository<MasterGroup> { } 