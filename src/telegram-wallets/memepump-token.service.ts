import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey, Transaction, Keypair, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Metaplex, keypairIdentity, toMetaplexFile } from '@metaplex-foundation/js';
import { 
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    DataV2
} from '@metaplex-foundation/mpl-token-metadata';
import * as path from 'path';
import bs58 from 'bs58';
import BN = require('bn.js');

// Import spl-token 0.4.13 from vendor using absolute path
const splTokenPath = path.resolve(__dirname, '../../../vendor/spl-token-0.4.13/node_modules/@solana/spl-token');
const { TOKEN_PROGRAM_ID } = require(path.join(splTokenPath, 'lib/cjs/constants'));
const { createInitializeMintInstruction } = require(path.join(splTokenPath, 'lib/cjs/instructions/initializeMint'));
const { createMintToInstruction } = require(path.join(splTokenPath, 'lib/cjs/instructions/mintTo'));
const { createAssociatedTokenAccountInstruction } = require(path.join(splTokenPath, 'lib/cjs/instructions/associatedTokenAccount'));

@Injectable()
export class MemepumpTokenService {
    private readonly logger = new Logger(MemepumpTokenService.name);
    private readonly DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

    constructor() {}

    async createTokenMemepump(
        connection: Connection,
        payerKeypair: Keypair,
        tokenData: {
            name: string;
            symbol: string;
            description?: string;
            twitter?: string;
            telegram?: string;
            website?: string;
            showName?: boolean;
            totalSupply?: number;
            decimals?: number;
        },
        logoFile: any
    ): Promise<{ mint: Keypair; metadataAddress: PublicKey; metadataUri: string }> {
        try {
            this.logger.log('Starting createTokenMemepump...');
            let logoUrl = '';

            // Initialize Metaplex
            this.logger.log('Initializing Metaplex...');
            const metaplex = Metaplex.make(connection)
                .use(keypairIdentity(payerKeypair));

            // Upload logo to Arweave
            if (logoFile) {
                this.logger.log('Uploading logo to Arweave...');
                const metaplexFile = toMetaplexFile(logoFile.buffer, logoFile.originalname, {
                    contentType: logoFile.mimetype,
                });
                const uploadResult = await metaplex.storage().upload(metaplexFile);
                logoUrl = uploadResult;
                this.logger.log(`Logo uploaded: ${logoUrl}`);
            }

            // Create metadata JSON with all required fields
            this.logger.log('Creating metadata JSON...');
            const metadataJson = {
                name: tokenData.name || '',
                symbol: tokenData.symbol || '',
                description: tokenData.description || '',
                image: logoUrl,
                showName: tokenData.showName !== undefined ? tokenData.showName : true,
                createdOn: 'https://memepump.gg',
                ...(tokenData.twitter && { twitter: tokenData.twitter }),
                ...(tokenData.telegram && { telegram: tokenData.telegram }),
                ...(tokenData.website && { website: tokenData.website })
            };

            // Upload metadata to Arweave
            this.logger.log('Uploading metadata to Arweave...');
            const metadataFile = toMetaplexFile(
                Buffer.from(JSON.stringify(metadataJson)),
                'metadata.json',
                { contentType: 'application/json' }
            );
            const uploadedMetadataUri = await metaplex.storage().upload(metadataFile);
            this.logger.log(`Metadata uploaded: ${uploadedMetadataUri}`);

            // Calculate total supply and decimals
            const totalSupply = tokenData.totalSupply || 1_000_000_000;
            const defaultDecimals = totalSupply > 3_000_000_000 ? 6 : 9;
            const decimals = tokenData.decimals !== undefined ? tokenData.decimals : defaultDecimals;

            // Create new SPL Token with correct total supply
            this.logger.log('Creating new SPL Token...');
            const { mint, metadataAddress, metadataUri } = await this.createSPLToken(
                connection,
                payerKeypair,
                {
                    ...tokenData,
                    decimals,
                    totalSupply
                },
                uploadedMetadataUri
            );

            // Log token details
            this.logger.log('Token created successfully:', {
                mintPublicKey: mint.publicKey.toBase58(),
                mintPrivateKey: bs58.encode(mint.secretKey),
                metadataAddress: metadataAddress.toBase58(),
                totalSupply,
                decimals
            });

            return {
                mint,
                metadataAddress,
                metadataUri
            };
        } catch (error) {
            this.logger.error('Error in createTokenMemepump:', error);
            throw error;
        }
    }

    // Sửa lại createSPLToken: không upload logo, không tạo metadata, chỉ nhận metadataUri và dùng cho bước tạo metadata account on-chain
    private async createSPLToken(
        connection: Connection,
        payer: Keypair,
        tokenData: any,
        metadataUri: string
    ): Promise<{ mint: Keypair; metadataAddress: PublicKey; metadataUri: string }> {
        // Create new mint account
        const mintKeypair = Keypair.generate();
        const lamports = await connection.getMinimumBalanceForRentExemption(82); // MINT_SIZE

        // Create transaction to create mint account
        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                space: 82, // MINT_SIZE
                lamports,
                programId: TOKEN_PROGRAM_ID
            }),
            createInitializeMintInstruction(
                mintKeypair.publicKey,
                tokenData.decimals ?? 9,
                payer.publicKey, // mint authority
                payer.publicKey, // freeze authority
                TOKEN_PROGRAM_ID
            )
        );

        // Send and confirm transaction
        const signature = await connection.sendTransaction(transaction, [payer, mintKeypair]);
        await connection.confirmTransaction(signature);

        // Create associated token account
        const associatedTokenAccount = await PublicKey.findProgramAddress(
            [
                payer.publicKey.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                mintKeypair.publicKey.toBuffer(),
            ],
            new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
        );

        // Create associated token account transaction
        const createAtaTransaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey,
                associatedTokenAccount[0],
                payer.publicKey,
                mintKeypair.publicKey,
                TOKEN_PROGRAM_ID
            )
        );

        // Send and confirm create ATA transaction
        const createAtaSignature = await connection.sendTransaction(createAtaTransaction, [payer]);
        await connection.confirmTransaction(createAtaSignature);

        // Set total supply and mint tokens
        const totalSupply = tokenData.totalSupply ?? 1_000_000_000;
        // Convert totalSupply to string to avoid precision loss
        const supply = new BN(totalSupply.toString());
        const decimals = new BN(tokenData.decimals ?? 9);
        const mintAmount = supply.mul(new BN(10).pow(decimals));
        
        // Create mintTo transaction
        const mintToTransaction = new Transaction().add(
            createMintToInstruction(
                mintKeypair.publicKey,
                associatedTokenAccount[0],
                payer.publicKey,
                mintAmount, // Pass BN directly instead of converting to number
                [],
                TOKEN_PROGRAM_ID
            )
        );

        // Send and confirm mintTo transaction
        const mintToSignature = await connection.sendTransaction(mintToTransaction, [payer]);
        await connection.confirmTransaction(mintToSignature);

        // Create metadata account on-chain
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mintKeypair.publicKey.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        );

        // Create metadata account transaction
        const createMetadataTransaction = new Transaction().add(
            createCreateMetadataAccountV3Instruction(
                {
                    metadata: metadataAddress,
                    mint: mintKeypair.publicKey,
                    mintAuthority: payer.publicKey,
                    payer: payer.publicKey,
                    updateAuthority: payer.publicKey,
                },
                {
                    createMetadataAccountArgsV3: {
                        data: {
                            name: tokenData.name,
                            symbol: tokenData.symbol,
                            uri: metadataUri, // dùng metadataUri đã upload
                            sellerFeeBasisPoints: 0,
                            creators: null,
                            collection: null,
                            uses: null,
                        },
                        isMutable: true,
                        collectionDetails: null
                    }
                }
            )
        );

        // Send and confirm create metadata transaction
        const createMetadataSignature = await connection.sendTransaction(createMetadataTransaction, [payer]);
        await connection.confirmTransaction(createMetadataSignature);

        return {
            mint: mintKeypair,
            metadataAddress,
            metadataUri
        };
    }
} 